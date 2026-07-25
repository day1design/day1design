// 업로드 정책 가드
//
// ⚠ WebP 전용이 아니다 — 되돌리지 말 것.
// 2026-05-20 `986f9d7` 에서 히어로 슬라이드 원본 업로드를 위해 정책을 의도적으로
// 완화했다: 5MB 이하 히어로 이미지는 admin 에서 webp 변환 없이 원본 그대로 올라가고
// (`site/admin/hero-slides.js` 의 skipCompressUnder: 5MB), 워커가 jpg/png 를 받아주지
// 않으면 히어로 업로드가 깨진다. "이미지는 webp 만" 으로 조이면 그게 회귀다.
//
// 알려진 구멍(별건): isImageUpload 가 `type.startsWith("image/") || ext 매칭` 이라
// 확장자만 맞으면 통과하고, upload.js 는 그 type 을 그대로 R2 contentType 으로 쓴다.
// 관리자 인증 뒤라 급하진 않지만 닫으려면 두 조건을 AND 로 묶으면 된다.

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUploadPolicy,
  isAllowedDocumentUpload,
  isImageUpload,
  isWebpImageUpload,
  uploadPolicyError,
} from "../src/lib/upload-policy.js";
import { sign as signJwt } from "../src/lib/jwt.js";
import { handleUpload } from "../src/routes/upload.js";

const JWT_SECRET = "test-secret";

function file(name, type) {
  return new File(["data"], name, { type });
}

async function adminCookie() {
  const jwt = await signJwt({ sub: "admin" }, JWT_SECRET, 3600);
  return `day1_admin=${encodeURIComponent(jwt)}`;
}

function uploadRequest(blob, filename, extraFields = {}) {
  const form = new FormData();
  form.append("file", blob, filename);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  return form;
}

test("[guard] 이미지 업로드는 webp 외 jpg/png/gif/avif 도 통과한다 (히어로 원본 업로드)", () => {
  for (const [name, type] of [
    ["sample.webp", "image/webp"],
    ["sample.jpg", "image/jpeg"],
    ["sample.png", "image/png"],
    ["sample.gif", "image/gif"],
    ["sample.avif", "image/avif"],
  ]) {
    assert.equal(isImageUpload(file(name, type)), true, `${name} 이미지 인식`);
    assert.equal(uploadPolicyError(file(name, type)), null, `${name} 통과`);
  }
});

test("이미지가 아니면 415 로 막는다", () => {
  assert.equal(
    uploadPolicyError(file("payload.exe", "application/octet-stream")),
    "Only image files are allowed",
  );
  assert.throws(
    () => assertUploadPolicy(file("payload.exe", "application/octet-stream")),
    (err) => err.status === 415 && /Only image files/.test(err.message),
  );
});

// isWebpImageUpload 는 export 만 되어 있고 업로드 게이트로 쓰이지 않는다.
// (게이트는 uploadPolicyError → isImageUpload) 좁게 판별하는 헬퍼로만 유지.
test("isWebpImageUpload 는 webp 만 좁게 판별한다 (업로드 게이트 아님)", () => {
  assert.equal(isWebpImageUpload(file("sample.webp", "image/webp")), true);
  assert.equal(isWebpImageUpload(file("sample.png", "image/png")), false);
  // 확장자만 webp 이고 타입이 다르면 false
  assert.equal(isWebpImageUpload(file("sample.webp", "image/png")), false);
});

test("문서 업로드는 PDF·ZIP 만, 타입까지 맞아야 한다", () => {
  assert.equal(isAllowedDocumentUpload(file("plan.pdf", "application/pdf")), true);
  assert.equal(isAllowedDocumentUpload(file("plan.zip", "application/zip")), true);
  assert.equal(
    isAllowedDocumentUpload(file("plan.zip", "application/x-zip-compressed")),
    true,
  );
  assert.equal(
    isAllowedDocumentUpload(file("plan.zip", "application/octet-stream")),
    true,
  );
  // 확장자가 pdf 여도 타입이 어긋나면 거부
  assert.equal(isAllowedDocumentUpload(file("plan.pdf", "application/zip")), false);
  // 확장자가 목록 밖이면 타입과 무관하게 거부
  assert.equal(
    isAllowedDocumentUpload(file("plan.exe", "application/octet-stream")),
    false,
  );
});

// 견적 폼: concept_files 는 allowDocuments:false(이미지만),
// floor_plans 는 allowDocuments:true(이미지+PDF/ZIP) — worker/src/routes/estimates.js
test("allowDocuments 여부에 따라 문서 허용과 에러 문구가 갈린다", () => {
  const pdf = file("plan.pdf", "application/pdf");
  assert.equal(uploadPolicyError(pdf, { allowDocuments: true }), null);
  assert.equal(
    uploadPolicyError(pdf, { allowDocuments: false }),
    "Only image files are allowed",
  );
  assert.equal(
    uploadPolicyError(file("plan.exe", "application/octet-stream"), {
      allowDocuments: true,
    }),
    "Only image files, PDF files, or ZIP files are allowed",
  );
});

test("admin upload route 는 비이미지를 415 로 거부하고 저장하지 않는다", async () => {
  let uploaded = false;
  const res = await handleUpload(
    new Request("https://api.example.test/api/upload/image", {
      method: "POST",
      headers: { cookie: await adminCookie() },
      body: uploadRequest(
        new Blob(["mz"], { type: "application/octet-stream" }),
        "payload.exe",
      ),
    }),
    { JWT_SECRET },
    {},
    {
      media: {
        async upload() {
          uploaded = true;
        },
      },
    },
  );
  const body = await res.json();

  assert.equal(res.status, 415);
  assert.equal(body.error, "Only image files are allowed");
  assert.equal(uploaded, false);
});

test("[guard] admin upload route 는 PNG 원본을 받고 contentType 을 보존한다", async () => {
  const uploads = [];
  const res = await handleUpload(
    new Request("https://api.example.test/api/upload/image", {
      method: "POST",
      headers: { cookie: await adminCookie() },
      body: uploadRequest(new Blob(["png"], { type: "image/png" }), "sample.png", {
        folder: "hero",
      }),
    }),
    { JWT_SECRET },
    {},
    {
      media: {
        async upload(key, body, opts) {
          uploads.push({ key, body, opts });
          return `https://assets.example.test/${key}`;
        },
      },
    },
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].key, /^hero\/\d{8}-[a-z0-9]+\/sample\.png$/);
  // webp 로 덮어쓰지 않는다 — 원본 보존이 이 완화의 목적
  assert.deepEqual(uploads[0].opts, { contentType: "image/png" });
  assert.match(body.url, /^https:\/\/assets\.example\.test\/hero\//);
});

test("admin upload route stores WebP images through injected media store", async () => {
  const uploads = [];
  const res = await handleUpload(
    new Request("https://api.example.test/api/upload/image", {
      method: "POST",
      headers: { cookie: await adminCookie() },
      body: uploadRequest(
        new Blob(["webp"], { type: "image/webp" }),
        "sample.webp",
        { folder: "hero" },
      ),
    }),
    { JWT_SECRET },
    {},
    {
      media: {
        async upload(key, body, opts) {
          uploads.push({ key, body, opts });
          return `https://assets.example.test/${key}`;
        },
      },
    },
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].key, /^hero\/\d{8}-[a-z0-9]+\/sample\.webp$/);
  assert.deepEqual(uploads[0].opts, { contentType: "image/webp" });
  assert.match(body.url, /^https:\/\/assets\.example\.test\/hero\//);
});

test("인증 없는 업로드는 401", async () => {
  const res = await handleUpload(
    new Request("https://api.example.test/api/upload/image", {
      method: "POST",
      body: uploadRequest(new Blob(["webp"], { type: "image/webp" }), "x.webp"),
    }),
    { JWT_SECRET },
    {},
    {
      media: {
        async upload() {
          throw new Error("인증 전에 저장되면 안 된다");
        },
      },
    },
  );
  assert.equal(res.status, 401);
});
