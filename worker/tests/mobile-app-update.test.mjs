import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMobileAppUpdateResponse,
  handleMobileAppUpdate,
  MANIFEST_KEY,
  MOBILE_APP_UPDATE_CONTRACT,
} from "../src/lib/mobile-app-update.js";

const auth = { id: "user-1", tenant_id: "tenant-1", session_id: "session-1" };
const secret = "local-session-secret";
const valid = {
  packageName: "kr.polarad.crm",
  versionCode: 9,
  versionName: "0.1.8",
  sizeBytes: 4,
  sha256: "a".repeat(64),
  objectKey: `mobile-crm/releases/android/kr.polarad.crm/v9/${"a".repeat(64)}.apk`,
  mandatory: false,
  releaseNote: "원격 업데이트 테스트",
};

function bucket(manifest = valid, apk = new Uint8Array([1, 2, 3, 4])) {
  const objects = new Map();
  if (manifest) {
    objects.set(MANIFEST_KEY, JSON.stringify(manifest));
    objects.set(manifest.objectKey, apk);
  }
  let gets = 0;
  return {
    getCount: () => gets,
    async get(key) {
      gets += 1;
      const value = objects.get(key);
      if (value === undefined) return null;
      if (key === MANIFEST_KEY) return { size: Buffer.byteLength(value), text: async () => value };
      return { size: value.byteLength, body: value };
    },
  };
}

function envWith(store) { return { CRM_CACHE: store, CRM_SESSION_SECRET: secret }; }

test("latest validates the complete manifest before comparing version and returns a session-bound signed path", async () => {
  const store = bucket();
  const response = await handleMobileAppUpdate(
    new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=8"),
    envWith(store), auth, "/app-update/latest",
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.available, true);
  assert.match(body.downloadPath, /^\/api\/mobile\/app-update\/artifacts\/v9-a{64}\.apk\?expires=/);
  assert.equal(store.getCount(), 1);
});

test("same or lower candidate is latest only after manifest validation", async () => {
  const store = bucket();
  const response = await handleMobileAppUpdate(
    new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=9"),
    envWith(store), auth, "/app-update/latest",
  );
  assert.deepEqual(await response.json(), { ok: true, available: false, latest: true });
  await assert.rejects(() => buildMobileAppUpdateResponse({ ...valid, sha256: "bad" }, { currentVersionCode: 99, auth, signingSecret: secret }), /sha256/);
});

test("authentication, platform, manifest absence, and malformed manifest fail closed", async () => {
  assert.equal(await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/home", { method: "POST" }), envWith(bucket()), auth, "/home"), null);
  assert.equal(await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/home"), envWith(bucket()), null, "/home"), null);
  const unauthenticated = await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=8"), envWith(bucket()), null, "/app-update/latest");
  assert.equal(unauthenticated.status, 401);
  const wrongPlatform = await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/app-update/latest?platform=ios&package=kr.polarad.crm&version_code=8"), envWith(bucket()), auth, "/app-update/latest");
  assert.equal(wrongPlatform.status, 400);
  const missing = await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=8"), envWith(bucket(null)), auth, "/app-update/latest");
  assert.equal(missing.status, 503);
  const malformed = await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=99"), envWith(bucket({ ...valid, objectKey: "mobile-crm/releases/android/kr.polarad.crm/v9/../secret.apk" })), auth, "/app-update/latest");
  assert.equal(malformed.status, 503);
  const missingVersion = await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code="), envWith(bucket()), auth, "/app-update/latest");
  assert.equal(missingVersion.status, 400);
  const missingManifestSize = { async get() { return { text: async () => JSON.stringify(valid) }; } };
  const unavailable = await handleMobileAppUpdate(new Request("https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=8"), envWith(missingManifestSize), auth, "/app-update/latest");
  assert.equal(unavailable.status, 503);
});

test("download verifies expiry, signature, identity, manifest and object size before streaming private APK", async () => {
  const now = Math.floor(Date.now() / 1000);
  const store = bucket();
  const latest = await handleMobileAppUpdate(new Request(`https://api.example.test/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=8`), envWith(store), auth, "/app-update/latest");
  const path = (await latest.json()).downloadPath;
  const good = await handleMobileAppUpdate(new Request(`https://api.example.test${path}`), envWith(store), auth, new URL(`https://api.example.test${path}`).pathname.replace("/api/mobile", ""));
  assert.equal(good.status, 200);
  assert.equal(good.headers.get("cache-control"), "private, no-store");
  assert.equal(good.headers.get("content-type"), "application/vnd.android.package-archive");
  assert.equal((await good.arrayBuffer()).byteLength, 4);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const stillGood = await handleMobileAppUpdate(new Request(`https://api.example.test${path}`), envWith(store), auth, new URL(`https://api.example.test${path}`).pathname.replace("/api/mobile", ""));
  assert.equal(stillGood.status, 200);
  const other = await handleMobileAppUpdate(new Request(`https://api.example.test${path}`), envWith(store), { ...auth, session_id: "other" }, new URL(`https://api.example.test${path}`).pathname.replace("/api/mobile", ""));
  assert.equal(other.status, 403);
  const expired = path.replace(/expires=\d+/, `expires=${now - 1}`);
  const expiredResponse = await handleMobileAppUpdate(new Request(`https://api.example.test${expired}`), envWith(store), auth, new URL(`https://api.example.test${expired}`).pathname.replace("/api/mobile", ""));
  assert.equal(expiredResponse.status, 401);
  const tooFar = await buildMobileAppUpdateResponse(valid, { currentVersionCode: 8, auth, signingSecret: secret, now: now + 301 });
  const tooFarUrl = new URL(`https://api.example.test${tooFar.downloadPath}`);
  const tooFarResponse = await handleMobileAppUpdate(new Request(tooFarUrl), envWith(store), auth, tooFarUrl.pathname.replace("/api/mobile", ""));
  assert.equal(tooFarResponse.status, 401);
  assert.equal(MOBILE_APP_UPDATE_CONTRACT.manifestKey, MANIFEST_KEY);
});
