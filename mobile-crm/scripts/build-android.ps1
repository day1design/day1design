param([ValidateSet('Debug','Release')][string]$Configuration = 'Debug')
$ErrorActionPreference = 'Stop'
$crmRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Android SDK is missing; see DEVELOPMENT_SETUP.md.' }
$env:GRADLE_USER_HOME = Join-Path $crmRoot '.tools\gradle-cache'
$gradlePath = Join-Path $crmRoot '.tools\gradle-8.13\bin\gradle.bat'
$androidRoot = Join-Path $crmRoot 'android'
if (-not (Test-Path -LiteralPath $gradlePath)) { throw 'Project-local Gradle is missing; see DEVELOPMENT_SETUP.md.' }
& $gradlePath -p $androidRoot --offline --no-daemon --console=plain ("assemble" + $Configuration) ("lint" + $Configuration)
if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
