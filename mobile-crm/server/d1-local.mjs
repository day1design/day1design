import { DatabaseSync } from 'node:sqlite';

export function openLocalD1(path) {
  const sqlite = typeof path === 'string' ? new DatabaseSync(path) : path;
  sqlite.exec('PRAGMA foreign_keys=ON');
  const metrics = { reads: 0, writes: 0, analyticsReads: 0, cacheReads: 0 };
  function countRead(sql) { metrics.reads++; if (/CrmAnalyticsCache/.test(sql)) metrics.cacheReads++; else if (/GROUP BY|SUM\s*\(|COUNT\s*\(/i.test(sql)) metrics.analyticsReads++; }
  function statement(sql, args = []) {
    return {
      sql, args,
      bind(...values) { return statement(sql, values); },
      async first(column) {
        countRead(sql);
        const row = sqlite.prepare(sql).get(...args) || null;
        return column && row ? row[column] : row;
      },
      async all() { countRead(sql); return { results: sqlite.prepare(sql).all(...args), success: true }; },
      async run() {
        metrics.writes++;
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  return {
    sqlite, metrics,
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, args }) => {
          const query = sqlite.prepare(sql);
          if (query.columns().length) { countRead(sql); return { success: true, results: query.all(...args) }; }
          metrics.writes++;
          const result = query.run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
