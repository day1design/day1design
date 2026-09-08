import { DatabaseSync } from 'node:sqlite';

export function openLocalD1(path) {
  const sqlite = typeof path === 'string' ? new DatabaseSync(path) : path;
  sqlite.exec('PRAGMA foreign_keys=ON');
  function statement(sql, args = []) {
    return {
      sql, args,
      bind(...values) { return statement(sql, values); },
      async first(column) {
        const row = sqlite.prepare(sql).get(...args) || null;
        return column && row ? row[column] : row;
      },
      async all() { return { results: sqlite.prepare(sql).all(...args), success: true }; },
      async run() {
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  return {
    sqlite,
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, args }) => {
          const query = sqlite.prepare(sql);
          if (query.columns().length) return { success: true, results: query.all(...args) };
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
