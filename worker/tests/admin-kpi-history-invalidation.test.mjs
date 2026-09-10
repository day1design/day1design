import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE Estimates(id TEXT PRIMARY KEY,CrmTenantId TEXT,SubmittedAt TEXT,ConsultAt TEXT,Source TEXT,FirstSource TEXT);
    CREATE TABLE CrmDataRevisions(tenant_id TEXT PRIMARY KEY,version INTEGER,updated_at TEXT);
    INSERT INTO CrmDataRevisions VALUES('day1design',1,''),('other',1,'');
    CREATE TABLE EstimateContractHistory(id TEXT PRIMARY KEY,estimate_id TEXT REFERENCES Estimates(id) ON DELETE CASCADE,amount REAL,previous_amount REAL,stage TEXT,saved_at TEXT);
    CREATE INDEX idx_contract_history_estimate_cursor ON EstimateContractHistory(estimate_id,saved_at DESC,id DESC);
    CREATE TABLE MetaAdsDaily(CrmTenantId TEXT,Date TEXT,Level TEXT);
    CREATE TABLE CrmGa4AnalyticsSnapshots(tenant_id TEXT);`);
  for (const name of ['0095_admin_kpi.sql','0096_admin_kpi_jobs.sql','0097_admin_kpi_history_invalidation.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  }
  db.exec(`INSERT INTO Estimates VALUES('mine','day1design','2026-08-01T00:00:00Z','','homepage',''),('foreign','other','','','','');
    INSERT INTO EstimateContractHistory(id,estimate_id,amount,previous_amount,stage,saved_at) VALUES
    ('first','mine',100,0,'최종확정','2026-09-01T16:00:00Z'),
    ('later','mine',150,100,'최종확정','2026-09-04T16:00:00Z'),
    ('foreign-event','foreign',1000,0,'최종확정','2026-09-06T16:00:00Z');
    DELETE FROM AdminKpiDirtyDays;`);
  return db;
}
const days=db=>db.prepare("SELECT day FROM AdminKpiDirtyDays WHERE tenant_id='day1design' ORDER BY day").all().map(r=>r.day);

test('history date correction dirties old, new and later first-final-dependent days',()=>{
  const db=fixture();
  try {
    db.exec("UPDATE EstimateContractHistory SET saved_at='2026-09-02T16:00:00Z' WHERE id='first'");
    assert.deepEqual(days(db),['2026-09-02','2026-09-03','2026-09-05']);
    assert.equal(db.prepare("SELECT count(*) n FROM AdminKpiDirtyDays WHERE tenant_id='other'").get().n,0);
    const plan=db.prepare('EXPLAIN QUERY PLAN SELECT saved_at FROM EstimateContractHistory WHERE estimate_id=?').all('mine');
    assert(plan.some(r=>/SEARCH EstimateContractHistory USING COVERING INDEX .* \(estimate_id=\?\)/.test(r.detail)));
    assert(!plan.some(r=>/SCAN EstimateContractHistory/.test(r.detail)));
  } finally { db.close(); }
});

test('deleting the first final event also invalidates the later event now counted as first',()=>{
  const db=fixture();
  try { db.exec("DELETE FROM EstimateContractHistory WHERE id='first'"); assert.deepEqual(days(db),['2026-09-02','2026-09-05']); }
  finally { db.close(); }
});

test('customer cascade deletion invalidates contract days before owner disappears',()=>{
  const db=fixture();
  try {
    db.exec("INSERT INTO AdminKpiNormalized(tenant_id,estimate_id) VALUES('day1design','mine'); DELETE FROM Estimates WHERE id='mine'");
    assert.deepEqual(days(db),['2026-08-01','2026-09-02','2026-09-05']);
    assert.equal(db.prepare("SELECT count(*) n FROM EstimateContractHistory WHERE estimate_id='mine'").get().n,0);
    assert.equal(db.prepare("SELECT count(*) n FROM AdminKpiNormalized WHERE estimate_id='mine'").get().n,0);
    assert.equal(db.prepare("SELECT count(*) n FROM EstimateContractHistory WHERE estimate_id='foreign'").get().n,1);
  } finally { db.close(); }
});
