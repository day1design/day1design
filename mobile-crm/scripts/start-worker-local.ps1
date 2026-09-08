$ErrorActionPreference = 'Stop'
$crmRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $crmRoot 'server\worker-local.mjs'
$logPath = Join-Path $crmRoot '.tools\worker-local.log'
$errorPath = Join-Path $crmRoot '.tools\worker-local-error.log'
$listener = Get-NetTCPConnection -LocalPort 18792 -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw 'Port 18792 is already in use; inspect the existing process before restarting.' }
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList @($scriptPath) -WorkingDirectory $crmRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
Write-Output "Local Worker process: $($process.Id)"
