# Android CRM analytics contract

This is the backend contract for the Android first analytics surface. It is a read only, tenant scoped reader. Every source query must carry the authenticated tenant key and a bounded inclusive `YYYY-MM-DD` window of at most 366 days.

The current legacy D1 schema is not tenant safe for this surface: `Estimates`, `MetaAdsDaily`, `pixel_events`, and `HeatmapEvents` have no `CrmTenantId` (or equivalent tenant column) and compound tenant/date index. The reader therefore returns `available: false` with `reason: tenant_column_missing` or `tenant_date_index_missing` and does not run aggregate SQL. Adding a default tenant in application code would create cross tenant statistics and is prohibited.

Sources remain separate:

| Source | Meaning | Denominator |
| --- | --- | --- |
| `saved_estimates` | rows actually saved in `Estimates` | saved rows |
| `meta_ads` | account level rows synced from Meta | Meta reported leads for CPL; impressions for CPM; clicks or link clicks for CPC |
| `pixel_events` | browser Pixel/CAPI events | event rows |
| `sessions` | distinct non bot `page_view` sessions from the site tracker | distinct sessions |

The response labels each source with `period`, `denominator`, and `refreshed_at`. CPL, CPC, CPM, CTR, and saved lead rate are null when the denominator is absent or zero. `cpc` uses all clicks and `cpcLink` uses link clicks; neither is silently substituted for the other.

When `saved_estimates` is available, its metrics also include `trend` and `channels`. `trend` contains one row per KST calendar day that has saved rows in the requested window: `{ date, saved, metaSaved }`. `channels` groups the stored `Source` value, falling back to `Platform`, then `unknown`, and contains `{ channel, saved, metaSaved }`. The response reads at most 101 grouped labels, returns the first 100 most populated labels, and exposes `channelsHasMore`, `shownLeads`, `otherLeads`, `shownMetaLeads`, and `otherMetaLeads` so the Android UI cannot imply that a truncated list is complete. `shownLeads + otherLeads` equals the total `saved` count. These are intake row counts and source labels from `Estimates`; they are not a funnel, ad attribution, or session count. Empty days are omitted and no zero-filled activity is inferred. Labels are lower-cased and capped at 80 characters for a bounded response. If tenant/date schema requirements are unavailable, the entire source remains unavailable and no trend/channel aggregate query runs.

The 10:00 KST daily briefing uses the idempotency key `crm-briefing:YYYY-MM-DD:10:00:Asia/Seoul`. Facts are source backed counts and ratios. Hypotheses are an explicitly separate array. No automated performance verdict is emitted until a confirmed threshold policy exists; the current verdict is `null` with a reason.

Implementation: `worker/src/lib/crm-analytics.js`; pure and reader contract tests: `worker/tests/crm-analytics.test.mjs`.
