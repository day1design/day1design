param([int]$Port = 18791)
$ErrorActionPreference = 'Stop'
$crmRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $crmRoot 'server'
$runtimeRoot = Join-Path $serverRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$dbPath = Join-Path $runtimeRoot 'crm.sqlite3'
if (-not (Test-Path -LiteralPath $dbPath)) {
    & python (Join-Path $serverRoot 'seed.py') --db $dbPath
    if ($LASTEXITCODE -ne 0) { throw 'Development fixture creation failed.' }
}
$env:CRM_DB = $dbPath
$env:CRM_INBOX = Join-Path $runtimeRoot 'inbox'
$env:CRM_PORT = [string]$Port
Write-Host "Local development API: http://127.0.0.1:$Port"
Write-Host 'Isolated fixture data. No production API or email delivery.'
& python (Join-Path $serverRoot 'app.py')
if ($LASTEXITCODE -ne 0) { throw 'Development API exited with an error.' }
