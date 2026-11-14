// The ratings in a Cloudflare D1 database (SQLite). Every statement is here, so the tests can run them on SQLite itself.

export function d1Store(db) {
  return {
    async save({ plugin, device, stars, works, version }, now) {
      await db
        .prepare(
          'INSERT INTO ratings (plugin, device, stars, works, version, updated) VALUES (?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT (plugin, device) DO UPDATE SET stars = excluded.stars, works = excluded.works, ' +
            'version = excluded.version, updated = excluded.updated',
        )
        .bind(plugin, device, stars, works, version, now)
        .run();
    },
    async withdraw({ plugin, device }) {
      await db.prepare('DELETE FROM ratings WHERE plugin = ? AND device = ?').bind(plugin, device).run();
    },
    // Counts one request against `key` in this hour and says how many that is.
    async hit(key, window) {
      const row = await db
        .prepare('INSERT INTO hits (key, window, n) VALUES (?, ?, 1) ON CONFLICT (key, window) DO UPDATE SET n = n + 1 RETURNING n')
        .bind(key, window)
        .first();
      return row.n;
    },
    async purge(beforeWindow) {
      await db.prepare('DELETE FROM hits WHERE window < ?').bind(beforeWindow).run();
    },
    async aggregate() {
      const { results } = await db
        .prepare(
          'SELECT plugin, COUNT(stars) AS rated, COALESCE(SUM(stars), 0) AS total, ' +
            'COALESCE(SUM(works = 1), 0) AS works, COALESCE(SUM(works = 0), 0) AS broken ' +
            'FROM ratings GROUP BY plugin',
        )
        .all();
      return results;
    },
  };
}
