import {
  d1Create,
  d1Delete,
  d1Get,
  d1List,
  d1ListAll,
  d1ReplaceAll,
  d1Update,
} from "./d1.js";
import { r2DeleteMany, r2Upload } from "./r2.js";

export function createTableRepository(env, table) {
  return {
    list(opts) {
      return d1List(env, table, opts);
    },
    listAll(opts) {
      return d1ListAll(env, table, opts);
    },
    get(id) {
      return d1Get(env, table, id);
    },
    create(fields) {
      return d1Create(env, table, fields);
    },
    update(id, fields) {
      return d1Update(env, table, id, fields);
    },
    delete(id) {
      return d1Delete(env, table, id);
    },
    replaceAll(recordsFields) {
      return d1ReplaceAll(env, table, recordsFields);
    },
  };
}

export function createMediaStore(bucket, publicBase) {
  return {
    upload(key, body, opts = {}) {
      if (!bucket) throw new Error("R2 binding (IMAGES) missing");
      return r2Upload(bucket, key, body, {
        ...opts,
        publicBase: opts.publicBase || publicBase,
      });
    },
    deleteMany(urls) {
      return r2DeleteMany(bucket, urls, publicBase);
    },
  };
}

export function createObjectStore(bucket) {
  return {
    async putJson(key, data) {
      if (!bucket) throw new Error("R2 binding (IMAGES) missing");
      await bucket.put(key, JSON.stringify(data), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      });
      return key;
    },
  };
}

export function createServices(env = {}) {
  return {
    estimates: createTableRepository(env, "Estimates"),
    estimateMemos: createTableRepository(env, "EstimateMemos"),
    heroSlides: createTableRepository(env, "HeroSlides"),
    portfolio: createTableRepository(env, "Portfolio"),
    community: createTableRepository(env, "Community"),
    analyticsSnapshots: createTableRepository(env, "AnalyticsSnapshots"),
    adminSettings: createTableRepository(env, "AdminSettings"),
    messageTemplates: createTableRepository(env, "MessageTemplates"),
    smsLogs: createTableRepository(env, "SmsLogs"),
    analyticsRaw: createObjectStore(env.IMAGES),
    media: createMediaStore(env.IMAGES, env.R2_PUBLIC_BASE),
  };
}
