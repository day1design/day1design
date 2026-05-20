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

function Deploy-Worker {
  Write-Host "`n[1/3] Cloudflare Worker deploy" -ForegroundColor Cyan
  Push-Location (Join-Path $root 'worker')
  try {
    # wrangler 가 CLOUDFLARE_API_TOKEN 우선 보므로 강제로 비워서 Global API Key 사용
    $env:CLOUDFLARE_API_TOKEN = ''
    & npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed" }
  } finally {
    Pop-Location
  }
}

function Deploy-Main {
  Write-Host "`n[2/3] Main Vercel deploy (day1design.co.kr)" -ForegroundColor Cyan
  Push-Location $root
  try {
    & npx vercel --prod --token $env:VERCEL_TOKEN --yes
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
