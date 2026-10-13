const { queryDatabasePromise } = require('../config/database');
const { SEASON_KEYS } = require('../config/roomRates');

// Pool Villa's rates have nothing to do with room_rates/roomRatesModel.js -
// no room type, no weekday/weekend split, no breakfast tiers. Just
// season x category (walk_in/agency only) x number of guests -> amount,
// matching the owner's printed rate card exactly. See
// database_migrations/startupMigrations.js (runPoolVillaRatesMigration) for
// the table, and views/room_rates/room_rates.ejs for the admin UI that
// manages it.
const POOL_VILLA_CATEGORIES = new Set(['walk_in', 'agency']);

class PoolVillaRatesModel {
  // Nested map for the admin page: { [season]: { [category]: { [guestCount]: amount } } }
  static async getAll() {
    const rows = await queryDatabasePromise(
      `SELECT SEASON, CATEGORY, GUEST_COUNT, AMOUNT FROM pool_villa_rates`
    );
    const map = {};
    for (const r of rows) {
      map[r.SEASON] = map[r.SEASON] || {};
      map[r.SEASON][r.CATEGORY] = map[r.SEASON][r.CATEGORY] || {};
      map[r.SEASON][r.CATEGORY][r.GUEST_COUNT] = Number(r.AMOUNT);
    }
    return map;
  }

  // Single-cell lookup used by booking price resolution - null means "not
  // offered" (e.g. 3 guests in Peak season, which the rate card simply
  // doesn't price), not a 0 rate.
  static async getRate({ season, category, guestCount }) {
    const rows = await queryDatabasePromise(
      `SELECT AMOUNT FROM pool_villa_rates WHERE SEASON = ? AND CATEGORY = ? AND GUEST_COUNT = ? LIMIT 1`,
      [season, category, guestCount]
    );
    return rows.length ? Number(rows[0].AMOUNT) : null;
  }

  // rates: [{ season, category, guestCount, amount }, ...]. Unlike
  // room_rates (a fixed grid where every cell always exists), guest-count
  // tiers here are admin-managed with no fixed set - a row with amount
  // null/blank/removed from the UI gets DELETEd instead of zeroed, so
  // "remove this tier" actually removes it rather than silently pricing it
  // at 0.
  static async saveMany(rates, userId = null) {
    const clean = (Array.isArray(rates) ? rates : [])
      .map((r) => ({
        season: String(r.season || ''),
        category: String(r.category || ''),
        guestCount: parseInt(r.guestCount, 10),
        amount: r.amount === null || r.amount === undefined || r.amount === '' ? null : parseFloat(r.amount)
      }))
      .filter((r) =>
        SEASON_KEYS.has(r.season)
        && POOL_VILLA_CATEGORIES.has(r.category)
        && Number.isInteger(r.guestCount) && r.guestCount >= 1 && r.guestCount <= 31
      );

    if (!clean.length) return { updated: 0, deleted: 0 };

    const toUpsert = clean.filter((r) => r.amount !== null && !Number.isNaN(r.amount) && r.amount >= 0);
    const toDelete = clean.filter((r) => r.amount === null || Number.isNaN(r.amount));

    if (toUpsert.length) {
      const placeholders = toUpsert.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = [];
      toUpsert.forEach((r) => params.push(r.season, r.category, r.guestCount, r.amount, userId));
      await queryDatabasePromise(
        `INSERT INTO pool_villa_rates (SEASON, CATEGORY, GUEST_COUNT, AMOUNT, UPDATED_BY)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           AMOUNT = VALUES(AMOUNT),
           UPDATED_BY = VALUES(UPDATED_BY),
           UPDATED_DT = CURRENT_TIMESTAMP`,
        params
      );
    }

    for (const r of toDelete) {
      await queryDatabasePromise(
        `DELETE FROM pool_villa_rates WHERE SEASON = ? AND CATEGORY = ? AND GUEST_COUNT = ?`,
        [r.season, r.category, r.guestCount]
      );
    }

    return { updated: toUpsert.length, deleted: toDelete.length };
  }
}

module.exports = PoolVillaRatesModel;
