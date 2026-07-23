[CmdletBinding()]
param(
  [switch]$Remote,
  [string]$PersistTo = "",
  [string]$FromDate = "",
  [string]$ToDate = ""
)

$ErrorActionPreference = "Stop"

if ($Remote -and $PersistTo) {
  throw "Choose either -Remote or -PersistTo."
}
if (-not $Remote -and [string]::IsNullOrWhiteSpace($PersistTo)) {
  throw "Use -Remote for production or -PersistTo <path> for isolated local validation."
}

$workerDir = Split-Path -Parent $PSScriptRoot
$wranglerPath = Join-Path $workerDir "node_modules\wrangler\bin\wrangler.js"
$migrationPath = Join-Path $workerDir "migrations\0030_analytics_rollups.sql"

if (-not (Test-Path -LiteralPath $wranglerPath)) {
  throw "The project-local Wrangler runtime is missing."
}
if (-not (Test-Path -LiteralPath $migrationPath)) {
  throw "Analytics migration 0030 is missing."
}

$targetArgs = if ($Remote) {
  @("--remote", "--yes")
} else {
  $resolvedPersistPath = [System.IO.Path]::GetFullPath($PersistTo)
  @("--local", "--persist-to", $resolvedPersistPath)
}

$culture = [System.Globalization.CultureInfo]::InvariantCulture
$dateStyle = [System.Globalization.DateTimeStyles]::None
$kstOffset = [TimeSpan]::FromHours(9)

function Invoke-D1Json {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Sql
  )

  $raw = & node $wranglerPath "d1" "execute" "day1design" @targetArgs "--command=$Sql" "--json"
  if ($LASTEXITCODE -ne 0) {
    throw "D1 command failed."
  }
  return ($raw | ConvertFrom-Json)
}

function Get-FirstResultRow {
  param(
    [Parameter(Mandatory = $true)]
    $Response
  )

  if (-not $Response -or -not $Response[0].success) {
    throw "D1 command returned an unsuccessful response."
  }
  return $Response[0].results[0]
}

function Parse-Day {
  param(
    [string]$Value,
    [string]$Name
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }
  $parsed = [DateTime]::MinValue
  if (-not [DateTime]::TryParseExact(
      $Value,
      "yyyy-MM-dd",
      $culture,
      $dateStyle,
      [ref]$parsed
    )) {
    throw "$Name must use yyyy-MM-dd."
  }
  return $parsed.Date
}

Push-Location $workerDir
try {
  $schemaOutput = & node $wranglerPath "d1" "execute" "day1design" @targetArgs "--file=$migrationPath"
  if ($LASTEXITCODE -ne 0) {
    throw "Analytics schema migration 0030 failed."
  }

  $bounds = Get-FirstResultRow (Invoke-D1Json @"
SELECT
  MIN(CreatedAt) AS MinCreatedAt,
  MAX(CreatedAt) AS MaxCreatedAt
FROM HeatmapEvents;
"@)

  if (-not $bounds.MinCreatedAt -or -not $bounds.MaxCreatedAt) {
    [pscustomobject]@{
      ReadyForWorkerDeploy = $true
      FromDate = ""
      ToDate = ""
      RawEvents = 0
      RawAnalyticsEvents = 0
      RollupEvents = 0
      RawPageViews = 0
      RollupPageViews = 0
      RawSessionDays = 0
      RollupSessionDays = 0
      RollupSessions = 0
    }
    return
  }

  $sourceFrom = [DateTimeOffset]::Parse(
    [string]$bounds.MinCreatedAt,
    $culture,
    [System.Globalization.DateTimeStyles]::AssumeUniversal
  ).ToOffset($kstOffset).Date
  $sourceTo = [DateTimeOffset]::Parse(
    [string]$bounds.MaxCreatedAt,
    $culture,
    [System.Globalization.DateTimeStyles]::AssumeUniversal
  ).ToOffset($kstOffset).Date

  $requestedFrom = Parse-Day $FromDate "FromDate"
  $requestedTo = Parse-Day $ToDate "ToDate"
  $effectiveFrom = if ($requestedFrom) { $requestedFrom } else { $sourceFrom }
  $effectiveTo = if ($requestedTo) { $requestedTo } else { $sourceTo }
  if ($effectiveFrom -lt $sourceFrom) { $effectiveFrom = $sourceFrom }
  if ($effectiveTo -gt $sourceTo) { $effectiveTo = $sourceTo }
  if ($effectiveFrom -gt $effectiveTo) {
    throw "The requested analytics backfill range has no source rows."
  }

  [long]$rawEvents = 0
  [long]$rawAnalyticsEvents = 0
  [long]$rollupEvents = 0
  [long]$rawPageViews = 0
  [long]$rollupPageViews = 0
  [long]$rawSessionDays = 0
  [long]$rollupSessionDays = 0

  for ($day = $effectiveFrom; $day -le $effectiveTo; $day = $day.AddDays(1)) {
    $dayKey = $day.ToString("yyyy-MM-dd", $culture)
    $startKst = [DateTimeOffset]::new(
      $day.Year,
      $day.Month,
      $day.Day,
      0,
      0,
      0,
      $kstOffset
    )
    $endKst = $startKst.AddDays(1)
    $startUtc = $startKst.UtcDateTime.ToString(
      "yyyy-MM-ddTHH:mm:ss.fff'Z'",
      $culture
    )
    $endUtc = $endKst.UtcDateTime.ToString(
      "yyyy-MM-ddTHH:mm:ss.fff'Z'",
      $culture
    )

    $null = Invoke-D1Json @"
INSERT OR IGNORE INTO AnalyticsEvents (
  id, SessionId, CreatedAt, DayKey, EventType, Page, Device,
  Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
)
SELECT
  id,
  SessionId,
  CreatedAt,
  '$dayKey',
  EventType,
  Page,
  Device,
  Country,
  Region,
  City,
  Referrer,
  UtmSource,
  UtmMedium,
  UtmCampaign
FROM HeatmapEvents
WHERE CreatedAt >= '$startUtc'
  AND CreatedAt < '$endUtc'
  AND IsBot = 0
  AND SessionId != '';

INSERT OR IGNORE INTO AnalyticsPageViews (
  id, SessionId, CreatedAt, DayKey, HourKey, Page, Device,
  Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
)
SELECT
  id,
  SessionId,
  CreatedAt,
  '$dayKey',
  substr(datetime(CreatedAt, '+9 hours'), 1, 13),
  Page,
  Device,
  Country,
  Region,
  City,
  Referrer,
  UtmSource,
  UtmMedium,
  UtmCampaign
FROM AnalyticsEvents
WHERE DayKey = '$dayKey'
  AND EventType = 'page_view';

INSERT OR REPLACE INTO AnalyticsSessionDays (
  DayKey, SessionId, FirstSeenAt, LastSeenAt, Pageviews, EventCount,
  Device, Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
)
SELECT
  '$dayKey',
  SessionId,
  MIN(CreatedAt),
  MAX(CreatedAt),
  SUM(CASE WHEN EventType = 'page_view' THEN 1 ELSE 0 END),
  COUNT(*),
  MAX(CASE WHEN Device != '' THEN Device ELSE '' END),
  MAX(CASE WHEN Country != '' THEN Country ELSE '' END),
  MAX(CASE WHEN Region != '' THEN Region ELSE '' END),
  MAX(CASE WHEN City != '' THEN City ELSE '' END),
  MAX(CASE WHEN Referrer != '' THEN Referrer ELSE '' END),
  MAX(CASE WHEN UtmSource != '' THEN UtmSource ELSE '' END),
  MAX(CASE WHEN UtmMedium != '' THEN UtmMedium ELSE '' END),
  MAX(CASE WHEN UtmCampaign != '' THEN UtmCampaign ELSE '' END)
FROM AnalyticsEvents
WHERE DayKey = '$dayKey'
GROUP BY SessionId;

INSERT OR REPLACE INTO AnalyticsSessions (
  SessionId, FirstSeenAt, LastSeenAt, FirstDayKey, LastDayKey,
  ActiveDayCount, TotalPageviews
)
SELECT
  session_days.SessionId,
  MIN(session_days.FirstSeenAt),
  MAX(session_days.LastSeenAt),
  MIN(CASE WHEN session_days.Pageviews > 0 THEN session_days.DayKey END),
  MAX(CASE WHEN session_days.Pageviews > 0 THEN session_days.DayKey END),
  SUM(CASE WHEN session_days.Pageviews > 0 THEN 1 ELSE 0 END),
  SUM(session_days.Pageviews)
FROM AnalyticsSessionDays session_days
JOIN (
  SELECT SessionId
  FROM AnalyticsSessionDays
  WHERE DayKey = '$dayKey'
    AND Pageviews > 0
) changed USING (SessionId)
GROUP BY session_days.SessionId
HAVING SUM(session_days.Pageviews) > 0;
"@

    $dayParity = Get-FirstResultRow (Invoke-D1Json @"
SELECT
  (
    SELECT COUNT(*)
    FROM HeatmapEvents
    WHERE CreatedAt >= '$startUtc'
      AND CreatedAt < '$endUtc'
  ) AS RawEvents,
  (
    SELECT COUNT(*)
    FROM HeatmapEvents
    WHERE CreatedAt >= '$startUtc'
      AND CreatedAt < '$endUtc'
      AND IsBot = 0
      AND SessionId != ''
  ) AS RawAnalyticsEvents,
  (
    SELECT COUNT(*)
    FROM AnalyticsEvents
    WHERE DayKey = '$dayKey'
  ) AS RollupEvents,
  (
    SELECT COUNT(*)
    FROM HeatmapEvents
    WHERE CreatedAt >= '$startUtc'
      AND CreatedAt < '$endUtc'
      AND EventType = 'page_view'
      AND IsBot = 0
      AND SessionId != ''
  ) AS RawPageViews,
  (
    SELECT COUNT(*)
    FROM AnalyticsPageViews
    WHERE DayKey = '$dayKey'
  ) AS RollupPageViews,
  (
    SELECT COUNT(*)
    FROM (
      SELECT SessionId
      FROM HeatmapEvents
      WHERE CreatedAt >= '$startUtc'
        AND CreatedAt < '$endUtc'
        AND IsBot = 0
        AND SessionId != ''
      GROUP BY SessionId
    )
  ) AS RawSessionDays,
  (
    SELECT COUNT(*)
    FROM AnalyticsSessionDays
    WHERE DayKey = '$dayKey'
  ) AS RollupSessionDays;
"@)

    if (
      [long]$dayParity.RawAnalyticsEvents -ne [long]$dayParity.RollupEvents -or
      [long]$dayParity.RawPageViews -ne [long]$dayParity.RollupPageViews -or
      [long]$dayParity.RawSessionDays -ne [long]$dayParity.RollupSessionDays
    ) {
      throw "Analytics rollup parity failed for $dayKey. Do not deploy the Worker."
    }

    $rawEvents += [long]$dayParity.RawEvents
    $rawAnalyticsEvents += [long]$dayParity.RawAnalyticsEvents
    $rollupEvents += [long]$dayParity.RollupEvents
    $rawPageViews += [long]$dayParity.RawPageViews
    $rollupPageViews += [long]$dayParity.RollupPageViews
    $rawSessionDays += [long]$dayParity.RawSessionDays
    $rollupSessionDays += [long]$dayParity.RollupSessionDays
  }

  $sessionParity = Get-FirstResultRow (Invoke-D1Json @"
SELECT
  (
    SELECT COUNT(*)
    FROM (
      SELECT SessionId
      FROM AnalyticsSessionDays
      WHERE Pageviews > 0
      GROUP BY SessionId
    )
  ) AS SessionDaySessions,
  (SELECT COUNT(*) FROM AnalyticsSessions) AS RollupSessions;
"@)
  if (
    [long]$sessionParity.SessionDaySessions -ne
    [long]$sessionParity.RollupSessions
  ) {
    throw "Analytics session parity failed. Do not deploy the Worker."
  }

  [pscustomobject]@{
    ReadyForWorkerDeploy = $true
    FromDate = $effectiveFrom.ToString("yyyy-MM-dd", $culture)
    ToDate = $effectiveTo.ToString("yyyy-MM-dd", $culture)
    RawEvents = $rawEvents
    RawAnalyticsEvents = $rawAnalyticsEvents
    RollupEvents = $rollupEvents
    RawPageViews = $rawPageViews
    RollupPageViews = $rollupPageViews
    RawSessionDays = $rawSessionDays
    RollupSessionDays = $rollupSessionDays
    RollupSessions = [long]$sessionParity.RollupSessions
  }
} finally {
  Pop-Location
}
