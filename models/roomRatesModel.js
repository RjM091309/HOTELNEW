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

  // Resolves which room_type is "king" / "queen" by name - same heuristic the
  // startup migration uses to seed ROOM_TYPE_ID (see startupMigrations.js) -
  // so a King/Queen bed-type aggregate (Room Checker only tracks counts, not
  // specific room types) can look up a rate keyed by ROOM_TYPE_ID.
  static async getBedRoomTypeIds() {
    const rows = await queryDatabasePromise(`SELECT IDNo, NAME FROM room_type WHERE ACTIVE = 1 ORDER BY IDNo`);
    let kingTypeId = null;
    let queenTypeId = null;
    for (const t of rows) {
      const n = String(t.NAME || '').toLowerCase();
      if (n.includes('queen') && queenTypeId == null) queenTypeId = t.IDNo;
      else if (n.includes('king') && kingTypeId == null) kingTypeId = t.IDNo;
    }
    return { kingTypeId, queenTypeId };
  }

  // Monday-Thursday = weekday, Friday-Sunday = weekend (config/roomRates.js DAY_RANGES).
  static dayRangeForDate(date) {
    const day = date.getDay();
    return (day >= 1 && day <= 4) ? 'weekday' : 'weekend';
  }

  // Total for ONE room of roomTypeId across every night from startDate
  // (inclusive) to endDate (exclusive) - splits weekday/weekend PER NIGHT
  // instead of one flat rate for the whole stay, since a stay crossing from
  // e.g. Wed into Fri needs both rates, not just whichever the check-in
  // night happens to be.
  static async getStayTotalForRoomType({ startDate, endDate, roomTypeId, category, breakfast }) {
    if (!roomTypeId) {
      return { total: 0, nights: 0, nightlyRate: 0, weekdayRate: 0, weekendRate: 0, weekdayNights: 0, weekendNights: 0 };
    }
    const [weekdayRate, weekendRate] = await Promise.all([
      this.resolveNightlyRate({ roomTypeId, category, dayRange: 'weekday', breakfast }),
      this.resolveNightlyRate({ roomTypeId, category, dayRange: 'weekend', breakfast })
    ]);
    let total = 0;
    let weekdayNights = 0;
    let weekendNights = 0;
    const cursor = new Date(startDate);
    const end = new Date(endDate);
    while (cursor < end) {
      if (this.dayRangeForDate(cursor) === 'weekend') {
        weekendNights++;
        total += weekendRate || 0;
      } else {
        weekdayNights++;
        total += weekdayRate || 0;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const nights = weekdayNights + weekendNights;
    return {
      total,
      nights,
      nightlyRate: nights > 0 ? total / nights : 0,
      weekdayRate: weekdayRate || 0,
      weekendRate: weekendRate || 0,
      weekdayNights,
      weekendNights
    };
  }

  // King + Queen stay totals together - what Room Checker's Summary quotes.
  // breakfast is now baked into which rate column gets used (no/one/two),
  // not a separate add-on charge - see room_checker.js/recomputeRateSummaryTotals.
  // Also returns the weekday/weekend rate + night-count breakdown behind
  // each total, so the UI can show staff how the (possibly mixed) average
  // was actually arrived at instead of just the blended number.
  static async getRoomCheckerRates({ startDate, endDate, category, breakfast }) {
    const { kingTypeId, queenTypeId } = await this.getBedRoomTypeIds();
    // Also fetch the "no breakfast" baseline for the same room/category/range
    // regardless of which tier is actually selected - the difference between
    // it and the selected tier's total is exactly how much of that tier's
    // rate is breakfast, baked into the room rate rather than billed
    // separately (see recomputeRateSummaryTotals's bakedInBreakfastTotal).
    // No extra query when "no" is already what's selected - same call, reused.
    const noBreakfastCalls = breakfast === 'no' || !breakfast
      ? null
      : Promise.all([
        this.getStayTotalForRoomType({ startDate, endDate, roomTypeId: kingTypeId, category, breakfast: 'no' }),
        this.getStayTotalForRoomType({ startDate, endDate, roomTypeId: queenTypeId, category, breakfast: 'no' })
      ]);
    const [king, queen, noBreakfastPair] = await Promise.all([
      this.getStayTotalForRoomType({ startDate, endDate, roomTypeId: kingTypeId, category, breakfast }),
      this.getStayTotalForRoomType({ startDate, endDate, roomTypeId: queenTypeId, category, breakfast }),
      noBreakfastCalls
    ]);
    const [kingNoBreakfast, queenNoBreakfast] = noBreakfastPair || [king, queen];
    return {
      kingTotal: king.total,
      kingNightlyRate: king.nightlyRate,
      kingWeekdayRate: king.weekdayRate,
      kingWeekendRate: king.weekendRate,
      kingWeekdayNights: king.weekdayNights,
      kingWeekendNights: king.weekendNights,
      kingNoBreakfastTotal: kingNoBreakfast.total,
      kingNoBreakfastWeekdayRate: kingNoBreakfast.weekdayRate,
      kingNoBreakfastWeekendRate: kingNoBreakfast.weekendRate,
      queenTotal: queen.total,
      queenNightlyRate: queen.nightlyRate,
      queenWeekdayRate: queen.weekdayRate,
      queenWeekendRate: queen.weekendRate,
      queenWeekdayNights: queen.weekdayNights,
      queenWeekendNights: queen.weekendNights,
      queenNoBreakfastTotal: queenNoBreakfast.total,
      queenNoBreakfastWeekdayRate: queenNoBreakfast.weekdayRate,
      queenNoBreakfastWeekendRate: queenNoBreakfast.weekendRate,
      nights: king.nights || queen.nights
    };
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
