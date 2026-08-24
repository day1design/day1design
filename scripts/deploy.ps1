# day1design 통합 배포 스크립트
#
# 사용법 (프로젝트 루트 F:\day1design_homepage 에서):
#   .\scripts\deploy.ps1 all       # Worker + 메인 Vercel + admin Vercel 모두
#   .\scripts\deploy.ps1 admin     # admin Vercel만
#   .\scripts\deploy.ps1 worker    # Cloudflare Worker만
#   .\scripts\deploy.ps1 main      # 메인 Vercel(day1design.co.kr)만
#
# 마케팅슬러그·문자발송·heatmap 등 admin JS + Worker API 양쪽을 같이
# 수정한 경우 항상 `all` 로 배포할 것. 한쪽만 배포하면 404 패턴이 반복된다.

param(
  [Parameter(Position = 0)]
  [ValidateSet('all', 'admin', 'worker', 'main', 'd1', 'help')]
  [string]$Target = 'help'
)

# 2026-05-20: admin-day1design Vercel 프로젝트가 메인 day1design 프로젝트로
# 통합됨 (admin.day1design.co.kr → day1design 프로젝트 alias). 따라서 'admin'
# 타깃은 'main' 과 동일하게 동작한다. 별도 admin 배포는 더 이상 필요 없음.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'site/.env.local'

if (-not (Test-Path $envFile)) {
  Write-Error "site/.env.local not found at $envFile"
  exit 1
}

# .env.local 로드 (KEY=VALUE 라인만, VALUE 내부 = 허용)
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
    $name = $Matches[1]
    $value = $Matches[2].Trim('"').Trim("'")
    Set-Item -Path "Env:$name" -Value $value
  }
}

$ADMIN_PROJECT_ID = 'prj_SMk0FaZF5Y1nNcRsIQYKHKC6cHJA'
$ADMIN_ORG_ID = 'team_fuEnkCHCSVhgGlS7m39Jhz1e'

# 🔴 2026-08-24 원인규명 — PowerShell 에서 `& npx ...` 를 쓰면 안 된다.
#
# Node 설치본의 npx.ps1 은 인자를 이렇게 만든다:
#   $NPX_ARGS = <명령줄 텍스트>.Substring($MyInvocation.InvocationName.Length)
# 호출 연산자 `&` 를 붙이면 InvocationName 이 `npx` 가 아니라 `&`(1글자)가 되어
# "npx wrangler deploy" 에서 1글자만 잘려 "px wrangler deploy" 로 실행된다.
# npm 은 실재하는 px@0.1.2 를 레지스트리에서 받아오고, 거기 실행 파일이 없어
# `npm error could not determine executable to run` (exit 1) 을 낸다.
#
# 실측: `& npx wrangler --version` → 위 에러 / `npx wrangler --version` → 3.114.17
# 이 에러가 인증 실패처럼 보여 계정을 의심하게 만든다. 계정은 멀쩡했다.
# 구분법: 메시지가 `npm error` 로 시작하면 CLI 해석 문제이고,
#         wrangler 인증 오류라면 `Authentication error [code: 10000]` 로 나온다.
#
# 그래서 npx 를 아예 거치지 않는다. 로컬 node_modules/.bin 을 먼저 보고,
# 없으면 전역 설치본을 쓴다. npx 로 되돌리지 말 것.
function Resolve-Cli {
  param([string]$Name, [string]$LocalDir)
  $local = Join-Path $LocalDir "node_modules\.bin\$Name.cmd"
  if (Test-Path $local) { return $local }
  $globalCmd = (Get-Command $Name -ErrorAction SilentlyContinue).Source
  if ($globalCmd) { return $globalCmd }
  throw "$Name CLI 를 찾을 수 없습니다 (로컬 node_modules·전역 설치 모두 없음)"
}

# 배포 전 자격증명 점검. Global API Key 방식은 EMAIL + API_KEY 가 짝이어야 하고,
# 셸에 남은 다른 프로젝트 토큰이 끼어들면 엉뚱한 계정으로 배포된다.
# 값 위생(꼬리 공백·개행)까지 여기서 걸러 "인증은 되는데 값이 안 맞는" 상황을 막는다.
function Assert-CloudflareAccount {
  param([string]$WranglerPath)

  foreach ($k in @('CLOUDFLARE_EMAIL', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_ACCOUNT_ID')) {
    $v = [Environment]::GetEnvironmentVariable($k)
    if ([string]::IsNullOrWhiteSpace($v)) { throw "$k 가 site/.env.local 에 없습니다" }
    if ($v -ne $v.Trim()) { throw "$k 값 끝에 공백·개행이 붙어 있습니다 (인증 실패의 흔한 원인)" }
  }

  $who = & $WranglerPath whoami 2>&1 | Out-String
  $expected = $env:CLOUDFLARE_ACCOUNT_ID
  if ($who -notmatch [regex]::Escape($expected)) {
    Write-Host $who -ForegroundColor DarkGray
    throw "계정 불일치: wrangler 가 잡은 계정이 .env.local 의 CLOUDFLARE_ACCOUNT_ID($expected) 와 다릅니다"
  }
  Write-Host "  ✓ 계정 확인 $env:CLOUDFLARE_EMAIL / $($expected.Substring(0,8))…" -ForegroundColor DarkGray
}

function Deploy-Worker {
  Write-Host "`n[1/3] Cloudflare Worker deploy" -ForegroundColor Cyan
  Push-Location (Join-Path $root 'worker')
  try {
    # wrangler 가 CLOUDFLARE_API_TOKEN 우선 보므로 강제로 비워서 Global API Key 사용
    # (Global API Key 방식은 CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY 가 짝이어야 한다)
    $env:CLOUDFLARE_API_TOKEN = ''
    $env:CF_API_TOKEN = ''
    $wrangler = Resolve-Cli -Name 'wrangler' -LocalDir (Join-Path $root 'worker')
    Assert-CloudflareAccount -WranglerPath $wrangler
    & $wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed" }
  } finally {
    Pop-Location
  }
}

function Deploy-Main {
  Write-Host "`n[2/3] Main Vercel deploy (day1design.co.kr)" -ForegroundColor Cyan
  Push-Location $root
  try {
    # 평소 Vercel 배포는 git push 가 트리거한다(작업트리 직접 배포 사고 차단).
    # 이 경로는 push 자동배포가 안 걸릴 때의 수동 폴백이다.
    $vercel = Resolve-Cli -Name 'vercel' -LocalDir $root
    & $vercel --prod --token $env:VERCEL_TOKEN --yes
    if ($LASTEXITCODE -ne 0) { throw "main vercel deploy failed" }
  } finally {
    Pop-Location
  }
}

function Deploy-Admin {
  # 통합 후엔 admin = main 동일. 호환성을 위해 함수만 유지.
  Write-Host "`n[admin] admin.day1design.co.kr 은 메인 프로젝트로 통합되어 별도 배포 없음 → main deploy 로 대체" -ForegroundColor Yellow
  Deploy-Main
}

function Apply-D1Migrations {
  Write-Host "`n[D1] migrations/ 폴더의 모든 미적용 마이그레이션을 적용하려면 직접:" -ForegroundColor Yellow
  Write-Host "    cd worker; npx wrangler d1 execute day1design --remote --file=migrations/000X_xxx.sql" -ForegroundColor Yellow
  Write-Host "  (자동 적용은 멱등성 보장 어려워 수동 유지)"
}

switch ($Target) {
  'worker' { Deploy-Worker }
  'main'   { Deploy-Main }
  'admin'  { Deploy-Admin }
  'd1'     { Apply-D1Migrations }
  'all' {
    Deploy-Worker
    Deploy-Main
  }
  'help' {
    Write-Host @"
day1design 통합 배포 스크립트

사용:
  .\scripts\deploy.ps1 all      Worker + 메인 + admin 모두 배포 (기본 권장)
  .\scripts\deploy.ps1 worker   Cloudflare Worker만
  .\scripts\deploy.ps1 main     메인 Vercel (day1design.co.kr)만
  .\scripts\deploy.ps1 admin    admin Vercel (admin.day1design.co.kr)만
  .\scripts\deploy.ps1 d1       D1 마이그 명령 안내

마케팅슬러그·문자발송·heatmap 등 admin JS + Worker API 양쪽을 함께 수정한
경우 'all' 사용 권장. 한쪽만 배포하면 페이지/JS/API 중 어딘가 404 가 난다.
"@
  }
}

Write-Host "`n완료" -ForegroundColor Green
