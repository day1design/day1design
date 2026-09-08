# Android development API

Python standard-library HTTP + SQLite server, bound only to `127.0.0.1:18791`. This is an isolated development implementation with persistent fixture data. It does not connect to the existing Worker/D1, send mail/SMS, or implement production authentication infrastructure.

## Run

From the repository root:

```powershell
& .\mobile-crm\scripts\start-dev-server.ps1
```

The script creates fixtures only if the database file does not exist. Existing records are preserved. To create a separate fixture explicitly:

```powershell
python mobile-crm/server/seed.py --db mobile-crm/server/runtime/another.sqlite3
```

`seed.py` refuses a populated database unless `--reset` is explicitly supplied. The default fixture is `owner@day1.local` (owner), `staff@day1.local` (temporary read-only), and clearly marked development customer A. Neither account sends real mail.

OTP messages go to the ignored `server/runtime/inbox/*.json`. This private development delivery adapter contains plaintext codes for manual QA, and must not become a production inbox or HTTP endpoint. No code or bearer token is logged. SQLite stores OTP HMACs with a random per-database `.otp-key`, and SHA-256 bearer hashes. Keep the key and runtime excluded from version control and external uploads.

## Contract

Prefix every endpoint with `/api/mobile`. Unprefixed equivalents exist only for local compatibility.

| Method / path | Input / response |
| --- | --- |
| GET `/health` | Explicit isolated-development marker |
| POST `/auth/request-otp` | `{email}` → `{requested,expires_in}`; known, unknown and suspended identity responses are generic |
| POST `/auth/verify-otp` | `{email,code}` → `{token,expires_in}` |
| POST `/auth/logout` | Deletes the presented token, including suspended tenant tokens |
| GET `/me` | `{id,email,role,tenant:{id,name},branding:{brand,logo}}` |
| GET `/members` | Current tenant active members only, maximum 100 |
| GET `/customers?q=...&cursor=...` | `{customers,next_cursor}` |
| GET `/customers/{id}` | Flat customer plus `appointments`, `consultations`, `contracts`, `history_has_more` |
| PATCH `/customers/{id}` | Integer `version` plus any allowed edited fields |
| POST `/appointments` | `customer_id,version,kind,starts_at,location,address` |
| POST `/consultations` | `customer_id,version,result` |
| POST `/contracts` | `customer_id,version,amount,status,signed_at` |

All authenticated endpoints use `Authorization: Bearer <token>`. Active user and tenant suspension are checked on every request. All writes are owner-only until staff policy is confirmed. Every write runs in a transaction, validates tenant ownership, and records the actor in `audit`.

Customer PATCH allows `name,phone,email,region,budget,status,assignee_id`. `budget` is an integer, `assignee_id` is an active same-tenant user id or `null`. Unknown fields are rejected. Every customer or child-record mutation requires the current customer integer `version` and increments it. Stale versions return HTTP 409 with `details.current`; retrying the same child creation/version cannot create a second record. Refresh authoritative detail after saving.

`kind` is `visit` or `measurement`. `starts_at` and `signed_at` require an ISO timestamp with a timezone; storage normalizes to UTC. Appointment location and address are distinct required fields. Contract amount is a nonnegative integer and status is `draft`, `signed`, or `cancelled`.

Customer reads use an indexed 50-row cursor window (51st row only determines continuation). Search filters that window; follow `next_cursor` even if the current filtered page is empty. Detail histories are capped at 100 per kind and expose a truncation flag. Full history pagination is a follow-up.

OTP: random six digits, five-minute expiry, five failed attempts, 60-second request cooldown, independent email/IP request ceilings of five per 15 minutes, atomic single-use consumption, reissue invalidates the prior code. Sessions currently expire after 24 hours; refresh rotation/device registration is not yet implemented. Responses use `Cache-Control: no-store`; request bodies are capped at 64 KiB.

## Verification

```powershell
python -m unittest discover -s mobile-crm/server -v
```

HTTP tests cover account enumeration response shape, suspended identity delivery, OTP attempts/expiry/replay/concurrency, cooldown/rate limits, session logout/expiry/suspension, cross-tenant record/assignee access, staff write denial, CAS, malformed inputs, appointment/result/contract persistence and duplicate retry, and cursor pagination.

## Remaining service work

Platform superadmin/tenant onboarding, real approved OTP transport, membership policy, rotating/device sessions, existing D1 adapter and web/app synchronization, appointment update/cancel UI/API, notification outbox/FCM, customer reminders, analytics, briefing, signed update distribution and production deployment remain separate work. Do not report this local API as a deployed SaaS or as verified against real customers.
