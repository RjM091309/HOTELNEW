const { queryDatabasePromise } = require('../config/database');
const { isValidAxes } = require('../config/roomRates');

class RoomRatesModel {
  // Returns all rate cells as a nested map:
  //   rates[category][dayRange][roomTypeId][breakfast] = amount
  static async getAll() {
    const rows = await queryDatabasePromise(
      `SELECT CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST, AMOUNT
       FROM room_rates`
    );

    const map = {};
    for (const r of rows) {
      const rt = String(r.ROOM_TYPE_ID);
      map[r.CATEGORY] = map[r.CATEGORY] || {};
      map[r.CATEGORY][r.DAY_RANGE] = map[r.CATEGORY][r.DAY_RANGE] || {};
      map[r.CATEGORY][r.DAY_RANGE][rt] = map[r.CATEGORY][r.DAY_RANGE][rt] || {};
      map[r.CATEGORY][r.DAY_RANGE][rt][r.BREAKFAST] = Number(r.AMOUNT);
    }
    return map;
  }

  // Booking source / route -> room_rates.CATEGORY. Unknown -> walk_in.
  static categoryFromBookingRoute(route) {
    const r = String(route || '').toLowerCase();
    if (r === 'agency') return 'agency';
    if (r === 'tenant') return 'tenant';
    if (r === 'vip') return 'vip';
    if (r === 'employee') return 'employee';
    if (r === 'senior' || r === 'senior_special' || r === 'special') return 'senior_special';
    return 'walk_in';
  }

  // Breakfast persons -> room_rates.BREAKFAST key
  static breakfastKey(persons) {
    const n = Number(persons) || 0;
    if (n >= 2) return 'two';
    if (n === 1) return 'one';
    return 'no';
  }

  // The rate slice for one room type, so the client can pick weekday/weekend +
  // breakfast without another round-trip:
  //   slice.rates[category][dayRange][breakfast] = amount
  // room_rates is keyed by the FK room_rates.ROOM_TYPE_ID -> room_type.IDNo.
  static async getRatesForRoomType(roomTypeId) {
    const rows = await queryDatabasePromise(
      `SELECT CATEGORY, DAY_RANGE, BREAKFAST, AMOUNT
         FROM room_rates
        WHERE ROOM_TYPE_ID = ?`,
      [roomTypeId]
    );
    const map = {};
    for (const r of rows) {
      map[r.CATEGORY] = map[r.CATEGORY] || {};
      map[r.CATEGORY][r.DAY_RANGE] = map[r.CATEGORY][r.DAY_RANGE] || {};
      map[r.CATEGORY][r.DAY_RANGE][r.BREAKFAST] = Number(r.AMOUNT);
    }
    return { roomTypeId, rates: map };
  }

  // Single nightly amount from the matrix. Returns null when the cell is unknown.
  static async resolveNightlyRate({ roomTypeId, category, dayRange, breakfast, breakfastPersons }) {
    const cat = category || 'walk_in';
    const dr = dayRange === 'weekend' ? 'weekend' : 'weekday';
    const bf = breakfast || this.breakfastKey(breakfastPersons);
    const rows = await queryDatabasePromise(
      `SELECT AMOUNT FROM room_rates
       WHERE CATEGORY = ? AND DAY_RANGE = ? AND ROOM_TYPE_ID = ? AND BREAKFAST = ?
       LIMIT 1`,
      [cat, dr, roomTypeId, bf]
    );
    return rows.length ? Number(rows[0].AMOUNT) : null;
  }

  // updates: [{ category, dayRange, roomTypeId, breakfast, amount }]
  static async updateMany(updates, userId = null) {
    const clean = (Array.isArray(updates) ? updates : [])
      .map((u) => ({
        category: String(u.category || ''),
        dayRange: String(u.dayRange || ''),
        roomTypeId: parseInt(u.roomTypeId, 10),
        breakfast: String(u.breakfast || ''),
        amount: Number(u.amount)
      }))
      .filter((u) =>
        isValidAxes(u.category, u.dayRange, u.breakfast)
        && Number.isInteger(u.roomTypeId) && u.roomTypeId > 0
        && Number.isFinite(u.amount)
        && u.amount >= 0
      );

    if (!clean.length) return { updated: 0 };

    // Upsert every changed cell in one statement.
    const placeholders = clean.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    clean.forEach((u) => params.push(u.category, u.dayRange, u.roomTypeId, u.breakfast, u.amount, userId));

    await queryDatabasePromise(
      `INSERT INTO room_rates (CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST, AMOUNT, UPDATED_BY)
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
