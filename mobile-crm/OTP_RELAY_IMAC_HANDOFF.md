# iMac OTP relay staging handoff

The relay is prepared for a dedicated directory on `framei-iMac.local`:

`/Users/pola/day1design-crm-otp`

The relay listens only on `127.0.0.1:18893`. Cloudflared and the Cloudflare Worker route remain a separate parent-owned operation. The launchd template is `mobile-crm/scripts/com.polarad.day1design.crm-otp-relay.plist.template`; it uses `/usr/local/bin/node`, `KeepAlive`, and an explicit `CRM_OTP_RELAY_CONFIG` JSON path.

Run `mobile-crm/scripts/stage-otp-relay.ps1` for a dry-run validation. `-Apply` creates only the ignored local stage under `mobile-crm/.tools/otp-relay-stage`; it reads OTP relay values from `mobile-crm/.tools/production/worker-secrets.json`, SMTP values from `F:\master_polarad\.env.local`, and copies the existing `F:\master_polarad\node_modules\nodemailer` runtime into the stage without npm.

`mobile-crm/scripts/deploy-otp-relay.ps1` is dry-run by default and targets the existing `imac` SSH alias. With the existing `-AllowRemoteMutation` switch, it copies only the staged relay files and launchd template into the dedicated directory, runs remote `node --check` and `plutil -lint`, applies restrictive config permissions, bootstraps only this relay LaunchAgent, verifies `launchctl print`, and probes the loopback endpoint for its expected unauthenticated `401`. The switch is never used by the default path; deployment still requires the reviewed parent-owned version record and authorized execution.

The relay configuration pins `smtp.worksmobile.com:587`, `mkt@polarad.co.kr`, and `Reply-To: mkt@polarad.co.kr`. Secret values are not written to tracked files, printed, or included in this handoff. Existing iMac services are outside the target directory and are not modified.
