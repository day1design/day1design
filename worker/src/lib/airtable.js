const BASE_URL = "https://api.airtable.com/v0";

function headers(env, extra = {}) {
  return {
    authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
    "content-type": "application/json",
    ...extra,
  };
}

function tablePath(env, table) {
  return `${BASE_URL}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
}

export async function atList(
  env,
  table,
  { view, filter, sort, pageSize = 100, offset } = {},
) {
  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE env missing");
  }
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (filter) params.set("filterByFormula", filter);
  if (sort)
    sort.forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field);
      if (s.direction) params.set(`sort[${i}][direction]`, s.direction);
    });
  params.set("pageSize", String(pageSize));
  if (offset) params.set("offset", offset);

  const url = `${tablePath(env, table)}?${params}`;
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) throw new Error(`Airtable list ${table}: ${res.status}`);
  return res.json();
}

export async function atListAll(env, table, opts = {}) {
  const all = [];
  let offset;
  do {
    const data = await atList(env, table, { ...opts, offset });
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

export async function atGet(env, table, id) {
  const res = await fetch(`${tablePath(env, table)}/${id}`, {
    headers: headers(env),
  });
  if (!res.ok) throw new Error(`Airtable get ${table}/${id}: ${res.status}`);
  return res.json();
}

export async function atCreate(env, table, fields) {
  const res = await fetch(tablePath(env, table), {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable create ${table}: ${res.status} ${t}`);
  }
  return res.json();
}

export async function atUpdate(env, table, id, fields) {
  const res = await fetch(`${tablePath(env, table)}/${id}`, {
    method: "PATCH",
    headers: headers(env),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable update ${table}/${id}: ${res.status} ${t}`);
  }
  return res.json();
}

export async function atDelete(env, table, id) {
  const res = await fetch(`${tablePath(env, table)}/${id}`, {
    method: "DELETE",
    headers: headers(env),
  });
  if (!res.ok) throw new Error(`Airtable delete ${table}/${id}: ${res.status}`);
  return res.json();
}

/** 여러 레코드 일괄 생성 (Airtable 최대 10개/요청) */
export async function atCreateMany(env, table, recordsFields) {
  const out = [];
  for (let i = 0; i < recordsFields.length; i += 10) {
    const chunk = recordsFields.slice(i, i + 10);
    const res = await fetch(tablePath(env, table), {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({
        records: chunk.map((fields) => ({ fields })),
        typecast: true,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Airtable createMany ${table}: ${res.status} ${t}`);
    }
    const data = await res.json();
    out.push(...(data.records || []));
  }
  return out;
}
