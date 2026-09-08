param(
  [string]$StageRoot = 'F:\day1design_homepage\mobile-crm\.tools\otp-relay-stage',
  [string]$RemoteHost = 'imac',
  [string]$RemoteUser = 'pola',
  [string]$RemoteRoot = '/Users/pola/day1design-crm-otp',
  [switch]$AllowRemoteMutation
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$launchLabel = 'com.polarad.day1design.crm-otp-relay'
$launchFile = "$launchLabel.plist"
$remoteLaunchDir = '/Users/pola/Library/LaunchAgents'
$templatePath = Join-Path $PSScriptRoot 'com.polarad.day1design.crm-otp-relay.plist.template'

function Assert-ExactPath([string]$Value, [string]$Expected, [string]$Name) {
  if ($Value -ne $Expected) { throw "$Name must be exactly $Expected" }
}

function Assert-LocalFile([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing ${Name}: $Path" }
}

function Assert-LocalDirectory([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "Missing ${Name}: $Path" }
}

function Invoke-CheckedNative([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}

Assert-ExactPath $RemoteRoot '/Users/pola/day1design-crm-otp' 'RemoteRoot'
Assert-ExactPath $RemoteUser 'pola' 'RemoteUser'
if ($RemoteHost -notin @('imac', 'framei-iMac.local')) { throw 'RemoteHost must be the existing iMac SSH alias or its verified hostname.' }
Assert-LocalFile $templatePath 'launchd template'
Assert-LocalDirectory $StageRoot 'local stage'

$stageRootResolved = (Resolve-Path -LiteralPath $StageRoot).Path
foreach ($item in @('otp-relay.mjs', 'relay-config.json')) {
  Assert-LocalFile (Join-Path $stageRootResolved $item) "staged $item"
}
$relayVendor = Join-Path $stageRootResolved 'vendor'
Assert-LocalDirectory $relayVendor 'staged vendor directory'
Assert-LocalDirectory (Join-Path $relayVendor 'node_modules\nodemailer') 'staged Nodemailer runtime'

$templateText = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8
if ($templateText -notmatch [regex]::Escape($RemoteRoot) -or
    $templateText -notmatch [regex]::Escape($launchLabel)) {
  throw 'Launchd template does not target the expected OTP relay service.'
}

$remote = "$RemoteUser@$RemoteHost"
$remoteStage = "$RemoteRoot/.deploy-stage"
$remotePlistStage = "$remoteStage/$launchFile"
$remotePlistPath = "$remoteLaunchDir/$launchFile"
$remoteNodePath = "$RemoteRoot/otp-relay.mjs"
$remoteConfigPath = "$RemoteRoot/relay-config.json"
$remoteVendorPath = "$RemoteRoot/vendor"

foreach ($command in @('ssh', 'scp')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command is unavailable: $command" }
}

Write-Output "OTP relay deploy target: $remote`:$RemoteRoot"
Write-Output "Local stage validated: $stageRootResolved"
Write-Output 'Files: otp-relay.mjs, relay-config.json, vendor/node_modules/nodemailer, and launchd template.'
Write-Output 'Secret values are intentionally omitted from output.'

if (-not $AllowRemoteMutation) {
  Write-Output 'Dry run only. Remote mutation is disabled by default.'
Write-Output 'Would verify SSH connectivity, stage remote files, run node --check and plutil -lint, then bootstrap only the OTP relay LaunchAgent and POST-probe its loopback 401 boundary.'
  Write-Output 'No SSH, SCP, launchctl, or SMTP connection was performed.'
  exit 0
}

$relaySource = Join-Path $stageRootResolved 'otp-relay.mjs'
$relayConfig = Join-Path $stageRootResolved 'relay-config.json'
$localTemplate = $templatePath

# All remote paths are fixed above. This mutation is confined to the dedicated relay
# root plus this service's own LaunchAgent plist; unrelated services are untouched.
$prepareRemote = @(
  'set -eu',
  "mkdir -p '$remoteStage' '$remoteLaunchDir'",
  "test -d '$RemoteRoot'",
  "chmod 700 '$RemoteRoot'"
) -join '; '
Invoke-CheckedNative 'ssh' @($remote, $prepareRemote)

Invoke-CheckedNative 'scp' @($relaySource, "$remote`:$remoteStage/otp-relay.mjs")
Invoke-CheckedNative 'scp' @($relayConfig, "$remote`:$remoteStage/relay-config.json")
Invoke-CheckedNative 'scp' @($localTemplate, "$remote`:$remotePlistStage")
Invoke-CheckedNative 'scp' @('-r', $relayVendor, "$remote`:$remoteStage/")

$verifyAndActivate = @(
  'set -eu',
  "uid=`$(id -u)",
  "test -f '$remoteStage/otp-relay.mjs'",
  "test -f '$remoteStage/relay-config.json'",
  "test -d '$remoteStage/vendor/node_modules/nodemailer'",
  "/usr/local/bin/node --check '$remoteStage/otp-relay.mjs'",
  "plutil -lint '$remotePlistStage'",
  "chmod 600 '$remoteStage/relay-config.json'",
  "chmod 700 '$remoteStage/otp-relay.mjs'",
  "chmod 700 '$remoteStage/vendor' '$remoteStage/vendor/node_modules' '$remoteStage/vendor/node_modules/nodemailer'",
  "mkdir -p '$RemoteRoot/vendor/node_modules'",
  "mv '$remoteStage/otp-relay.mjs' '$remoteNodePath.new'",
  "mv '$remoteStage/relay-config.json' '$remoteConfigPath.new'",
  "mv '$remoteStage/vendor/node_modules/nodemailer' '$remoteVendorPath/node_modules/nodemailer.new'",
  "mv '$remoteNodePath.new' '$remoteNodePath'",
  "mv '$remoteConfigPath.new' '$remoteConfigPath'",
  "if [ -e '$remoteVendorPath/node_modules/nodemailer' ]; then test ! -e '$remoteVendorPath/node_modules/nodemailer.previous' || { echo 'existing Nodemailer backup prevents overwrite' >&2; exit 1; }; mv '$remoteVendorPath/node_modules/nodemailer' '$remoteVendorPath/node_modules/nodemailer.previous'; fi",
  "mv '$remoteVendorPath/node_modules/nodemailer.new' '$remoteVendorPath/node_modules/nodemailer'",
  "mv '$remotePlistStage' '$remotePlistPath.new'",
  "plutil -lint '$remotePlistPath.new'",
  "launchctl bootout gui/`$uid '$remotePlistPath' 2>/dev/null || true",
  "mv '$remotePlistPath.new' '$remotePlistPath'",
  "launchctl bootstrap gui/`$uid '$remotePlistPath'",
  "rmdir '$remoteStage/vendor/node_modules' '$remoteStage/vendor' '$remoteStage' 2>/dev/null || true",
  "launchctl print gui/`$uid/$launchLabel",
  "test `$(curl --retry 3 --retry-delay 1 --retry-connrefused -sS -o /dev/null -w '%{http_code}' -X POST --max-time 3 http://127.0.0.1:18893/crm/otp) = 401"
) -join '; '
Invoke-CheckedNative 'ssh' @($remote, $verifyAndActivate)

Write-Output "OTP relay deployed and bootstrapped: $remote/$launchLabel"
Write-Output 'Remote validation passed: node --check, plutil -lint, launchctl bootstrap, and launchctl print.'
