param(
  [string]$RepoRoot = 'F:\day1design_homepage',
  [string]$MailerRoot = 'F:\master_polarad',
  [string]$RemoteRoot = '/Users/pola/day1design-crm-otp',
  [string]$StageRoot = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
if (-not $StageRoot) { $StageRoot = Join-Path $RepoRoot 'mobile-crm\.tools\otp-relay-stage' }
$secretsPath = Join-Path $RepoRoot 'mobile-crm\.tools\production\worker-secrets.json'
$smtpEnvPath = Join-Path $MailerRoot '.env.local'
$relaySource = Join-Path $RepoRoot 'mobile-crm\server\otp-relay.mjs'
$nodemailerSource = Join-Path $MailerRoot 'node_modules\nodemailer'
$requiredSecretKeys = @('CRM_OTP_RELAY_TOKEN','CRM_OTP_RELAY_SECRET','CRM_OTP_FROM_EMAIL','CRM_OTP_REPLY_TO')
$requiredSmtpKeys = @('SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS')

function Read-DotEnv([string]$Path) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim(@([char]39, [char]34))
    }
  }
  return $values
}

if (-not (Test-Path -LiteralPath $secretsPath)) { throw "Missing project secret file: $secretsPath" }
if (-not (Test-Path -LiteralPath $smtpEnvPath)) { throw "Missing SMTP env file: $smtpEnvPath" }
if (-not (Test-Path -LiteralPath $relaySource)) { throw "Missing relay source: $relaySource" }
if (-not (Test-Path -LiteralPath $nodemailerSource)) { throw "Missing existing Nodemailer runtime: $nodemailerSource" }
$secrets = Get-Content -LiteralPath $secretsPath -Raw -Encoding UTF8 | ConvertFrom-Json
$smtp = Read-DotEnv $smtpEnvPath
foreach ($key in $requiredSecretKeys) { if (-not $secrets.$key) { throw "Missing secret key: $key" } }
foreach ($key in $requiredSmtpKeys) { if (-not $smtp[$key]) { throw "Missing SMTP key: $key" } }
if ($secrets.CRM_OTP_FROM_EMAIL -ne 'mkt@polarad.co.kr' -or $secrets.CRM_OTP_REPLY_TO -ne 'mkt@polarad.co.kr') { throw 'OTP sender identity is not mkt@polarad.co.kr' }
if ($smtp.SMTP_HOST -ne 'smtp.worksmobile.com' -or [int]$smtp.SMTP_PORT -ne 587 -or $smtp.SMTP_USER -ne 'mkt@polarad.co.kr') { throw 'SMTP identity is not the established NAVER WORKS account' }

$config = [ordered]@{
  CRM_OTP_RELAY_TOKEN = [string]$secrets.CRM_OTP_RELAY_TOKEN
  CRM_OTP_RELAY_SECRET = [string]$secrets.CRM_OTP_RELAY_SECRET
  CRM_OTP_FROM_EMAIL = 'mkt@polarad.co.kr'
  CRM_OTP_REPLY_TO = 'mkt@polarad.co.kr'
  CRM_OTP_RELAY_HOST = '127.0.0.1'
  CRM_OTP_RELAY_PORT = 18893
  SMTP_HOST = 'smtp.worksmobile.com'
  SMTP_PORT = 587
  SMTP_USER = 'mkt@polarad.co.kr'
  SMTP_PASS = [string]$smtp.SMTP_PASS
  SMTP_FROM_NAME = [string]$smtp.SMTP_FROM_NAME
  POLARAD_MAILER_ROOT = "$RemoteRoot/vendor"
}

Write-Output "OTP relay staging plan: $StageRoot -> $RemoteRoot"
Write-Output 'Sources validated: relay source, project OTP keys, NAVER WORKS SMTP identity, existing Nodemailer runtime.'
Write-Output 'Secret values are intentionally omitted from output.'
if (-not $Apply) { Write-Output 'Dry run only. Re-run with -Apply to create the ignored local staging directory.'; exit 0 }

New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot 'vendor\node_modules') | Out-Null
Copy-Item -LiteralPath $relaySource -Destination (Join-Path $StageRoot 'otp-relay.mjs') -Force
Copy-Item -LiteralPath $nodemailerSource -Destination (Join-Path $StageRoot 'vendor\node_modules\nodemailer') -Recurse -Force
$config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $StageRoot 'relay-config.json') -Encoding UTF8
Write-Output 'Local staging created. No SSH, SCP, launchd bootstrap, or SMTP connection was performed.'
