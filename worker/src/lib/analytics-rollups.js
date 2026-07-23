const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_BOUND_PARAMETERS = 100;

function chunkRows(rows, columnsPerRow) {
  const size = Math.max(1, Math.floor(MAX_BOUND_PARAMETERS / columnsPerRow));
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function kstKeysFromIso(iso) {
  const time = Date.parse(String(iso || ""));
  if (!Number.isFinite(time)) throw new Error("analytics_invalid_event_time");
  const shifted = new Date(time + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const dayKey = `${year}-${month}-${day}`;
  return { dayKey, hourKey: `${dayKey}T${hour}` };
}

export function kstRangeToUtc(startDate, endDate) {
  const startMs = Date.parse(`${startDate}T00:00:00+09:00`);
  const endMs = Date.parse(`${endDate}T00:00:00+09:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("analytics_invalid_range");
  }
  return {
    startUtc: new Date(startMs).toISOString(),
    endExclusiveUtc: new Date(endMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function buildAnalyticsRollupStatements(env, events) {
  if (!env?.DB || !Array.isArray(events)) return [];

  const validEvents = events
    .filter((event) => !event.isBot && event.sessionId)
    .map((event) => ({ ...event, ...kstKeysFromIso(event.createdAt) }));
  if (!validEvents.length) return [];

  const statements = [];

  for (const rows of chunkRows(validEvents, 14)) {
    const values = rows
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .join(", ");
    const args = rows.flatMap((event) => [
      event.id,
      event.sessionId,
      event.createdAt,
      event.dayKey,
      event.type,
      event.page,
      event.device,
      event.country,
      event.region,
      event.city,
      event.referrer,
      event.utmSource,
      event.utmMedium,
      event.utmCampaign,
    ]);
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO AnalyticsEvents (
           id, SessionId, CreatedAt, DayKey, EventType, Page, Device,
           Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
         ) VALUES ${values}`,
      ).bind(...args),
    );
  }

  const pageviews = validEvents.filter((event) => event.type === "page_view");
  if (pageviews.length) {
    for (const rows of chunkRows(pageviews, 14)) {
      const values = rows
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const args = rows.flatMap((event) => [
        event.id,
        event.sessionId,
        event.createdAt,
        event.dayKey,
        event.hourKey,
        event.page,
        event.device,
        event.country,
        event.region,
        event.city,
        event.referrer,
        event.utmSource,
        event.utmMedium,
        event.utmCampaign,
      ]);
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO AnalyticsPageViews (
             id, SessionId, CreatedAt, DayKey, HourKey, Page, Device,
             Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
           ) VALUES ${values}`,
        ).bind(...args),
      );
    }
  }

  const affectedSessionDays = Array.from(
    new Map(
      validEvents.map((event) => [
        `${event.dayKey}\u0000${event.sessionId}`,
        [event.dayKey, event.sessionId],
      ]),
    ).values(),
  );
  const affectedSessionDayValues = affectedSessionDays
    .map(() => "(?, ?)")
    .join(", ");
  statements.push(
    env.DB.prepare(
      `WITH affected(DayKey, SessionId) AS (
         VALUES ${affectedSessionDayValues}
       ),
       rebuilt AS (
         SELECT
           events.DayKey,
           events.SessionId,
           MIN(events.CreatedAt) AS FirstSeenAt,
           MAX(events.CreatedAt) AS LastSeenAt,
           SUM(CASE WHEN events.EventType = 'page_view' THEN 1 ELSE 0 END) AS Pageviews,
           COUNT(*) AS EventCount,
           MAX(CASE WHEN events.Device != '' THEN events.Device ELSE '' END) AS Device,
           MAX(CASE WHEN events.Country != '' THEN events.Country ELSE '' END) AS Country,
           MAX(CASE WHEN events.Region != '' THEN events.Region ELSE '' END) AS Region,
           MAX(CASE WHEN events.City != '' THEN events.City ELSE '' END) AS City,
           MAX(CASE WHEN events.Referrer != '' THEN events.Referrer ELSE '' END) AS Referrer,
           MAX(CASE WHEN events.UtmSource != '' THEN events.UtmSource ELSE '' END) AS UtmSource,
           MAX(CASE WHEN events.UtmMedium != '' THEN events.UtmMedium ELSE '' END) AS UtmMedium,
           MAX(CASE WHEN events.UtmCampaign != '' THEN events.UtmCampaign ELSE '' END) AS UtmCampaign
         FROM AnalyticsEvents events
         JOIN affected
           ON affected.DayKey = events.DayKey
          AND affected.SessionId = events.SessionId
         GROUP BY events.DayKey, events.SessionId
       )
       INSERT INTO AnalyticsSessionDays (
         DayKey, SessionId, FirstSeenAt, LastSeenAt, Pageviews, EventCount,
         Device, Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
       )
       SELECT
         DayKey, SessionId, FirstSeenAt, LastSeenAt, Pageviews, EventCount,
         Device, Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
       FROM rebuilt
       WHERE true
       ON CONFLICT(DayKey, SessionId) DO UPDATE SET
         FirstSeenAt = excluded.FirstSeenAt,
         LastSeenAt = excluded.LastSeenAt,
         Pageviews = excluded.Pageviews,
         EventCount = excluded.EventCount,
         Device = excluded.Device,
         Country = excluded.Country,
         Region = excluded.Region,
         City = excluded.City,
         Referrer = excluded.Referrer,
         UtmSource = excluded.UtmSource,
         UtmMedium = excluded.UtmMedium,
         UtmCampaign = excluded.UtmCampaign`,
    ).bind(...affectedSessionDays.flat()),
  );

  const affectedSessions = Array.from(
    new Set(validEvents.map((event) => event.sessionId)),
  );
  const affectedSessionValues = affectedSessions.map(() => "(?)").join(", ");
  statements.push(
    env.DB.prepare(
      `WITH affected(SessionId) AS (
         VALUES ${affectedSessionValues}
       ),
       rebuilt AS (
         SELECT
           session_days.SessionId,
           MIN(session_days.FirstSeenAt) AS FirstSeenAt,
           MAX(session_days.LastSeenAt) AS LastSeenAt,
           MIN(CASE WHEN session_days.Pageviews > 0 THEN session_days.DayKey END) AS FirstDayKey,
           MAX(CASE WHEN session_days.Pageviews > 0 THEN session_days.DayKey END) AS LastDayKey,
           SUM(CASE WHEN session_days.Pageviews > 0 THEN 1 ELSE 0 END) AS ActiveDayCount,
           SUM(session_days.Pageviews) AS TotalPageviews
         FROM AnalyticsSessionDays session_days
         JOIN affected USING (SessionId)
         GROUP BY session_days.SessionId
         HAVING SUM(session_days.Pageviews) > 0
       )
       INSERT INTO AnalyticsSessions (
         SessionId, FirstSeenAt, LastSeenAt, FirstDayKey, LastDayKey,
         ActiveDayCount, TotalPageviews
       )
       SELECT
         SessionId, FirstSeenAt, LastSeenAt, FirstDayKey, LastDayKey,
         ActiveDayCount, TotalPageviews
       FROM rebuilt
       WHERE true
       ON CONFLICT(SessionId) DO UPDATE SET
         FirstSeenAt = excluded.FirstSeenAt,
         LastSeenAt = excluded.LastSeenAt,
         FirstDayKey = excluded.FirstDayKey,
         LastDayKey = excluded.LastDayKey,
         ActiveDayCount = excluded.ActiveDayCount,
         TotalPageviews = excluded.TotalPageviews`,
    ).bind(...affectedSessions),
  );

  return statements;
}
