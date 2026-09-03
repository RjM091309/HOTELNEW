const { queryDatabasePromise } = require('../config/database');
const { isValidCell } = require('../config/roomRates');

class RoomRatesModel {
  // Returns all rate cells as a nested map: rates[category][dayRange][bedType][breakfast] = amount
  static async getAll() {
    const rows = await queryDatabasePromise(
      `SELECT CATEGORY, DAY_RANGE, BED_TYPE, BREAKFAST, AMOUNT
       FROM room_rates`
    );

    const map = {};
    for (const r of rows) {
      map[r.CATEGORY] = map[r.CATEGORY] || {};
      map[r.CATEGORY][r.DAY_RANGE] = map[r.CATEGORY][r.DAY_RANGE] || {};
      map[r.CATEGORY][r.DAY_RANGE][r.BED_TYPE] = map[r.CATEGORY][r.DAY_RANGE][r.BED_TYPE] || {};
      map[r.CATEGORY][r.DAY_RANGE][r.BED_TYPE][r.BREAKFAST] = Number(r.AMOUNT);
    }
    return map;
  }

  // updates: [{ category, dayRange, bedType, breakfast, amount }]
  static async updateMany(updates, userId = null) {
    const clean = (Array.isArray(updates) ? updates : [])
      .map((u) => ({
        category: String(u.category || ''),
        dayRange: String(u.dayRange || ''),
        bedType: String(u.bedType || ''),
        breakfast: String(u.breakfast || ''),
        amount: Number(u.amount)
      }))
      .filter((u) =>
        isValidCell(u.category, u.dayRange, u.bedType, u.breakfast)
        && Number.isFinite(u.amount)
        && u.amount >= 0
      );

    if (!clean.length) return { updated: 0 };

    // Upsert every changed cell in one statement.
    const placeholders = clean.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    clean.forEach((u) => params.push(u.category, u.dayRange, u.bedType, u.breakfast, u.amount, userId));

    await queryDatabasePromise(
      `INSERT INTO room_rates (CATEGORY, DAY_RANGE, BED_TYPE, BREAKFAST, AMOUNT, UPDATED_BY)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         AMOUNT = VALUES(AMOUNT),
         UPDATED_BY = VALUES(UPDATED_BY),
         UPDATED_DT = CURRENT_TIMESTAMP`,
      params
    );

    return { updated: clean.length };
  }
}

module.exports = RoomRatesModel;
