// ========================================
// ACTIVITY LOG / AUDIT TRAIL MODEL
// ========================================
// Central writer for the `activity_log` table. Every CRUD (write) operation
// across the system funnels through here so there is a single audit trail.
//
// Design rules:
//  - log() MUST NEVER throw. Audit logging is a side effect; if it fails it
//    should only warn, never break the user's request.
//  - OLD_DATA / NEW_DATA are stored as JSON text (LONGTEXT) so it works on
//    both MySQL and older MariaDB without a native JSON column.

const { queryDatabasePromise } = require('../config/database');

class ActivityLogModel {
  // Serialize any value to a string safe for a LONGTEXT column.
  static _toText(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.slice(0, 4000000);
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  static _clip(value, len) {
    if (value === null || value === undefined) return null;
    return String(value).slice(0, len);
  }

  // Coerce to a positive integer id, else null.
  static _toId(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Human labels for snapshot fields (used by the before/after diff).
  static get FIELD_LABELS() {
    return {
      guestName: 'Guest',
      roomNumber: 'Room',
      checkIn: 'Check-in',
      checkOut: 'Check-out',
      nights: 'Nights',
      bookingStatus: 'Booking Status',
      checkInStatus: 'Check-in Status',
      guests: 'Guests',
      bedCount: 'Bed Count',
      remarks: 'Remarks',
      roomRate: 'Room Rate',
      discount: 'Discount',
      reservationFee: 'Reservation Fee',
      paymentStatus: 'Payment Status',
      totalCost: 'Total Cost',
      paidAmount: 'Paid Amount',
      balance: 'Balance',
      securityDeposit: 'Security Deposit',
      extended: 'Extended',
      extendedDays: 'Extended Days',
      lateCheckout: 'Late Check-out',
      holdPending: 'Hold Pending',
      servicesTotal: 'Extra Services Total'
    };
  }

  /**
   * Flat, human-meaningful snapshot of a booking + its billing/payments totals.
   * Used to diff "before vs after" for edit actions. Never throws.
   */
  static async snapshotForAudit(bookingId) {
    const id = this._toId(bookingId);
    if (!id) return null;
    try {
      const rows = await queryDatabasePromise(
        `SELECT
           c.NAME                                   AS guestName,
           r.ROOM_NUMBER                            AS roomNumber,
           DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d')  AS checkIn,
           DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS checkOut,
           DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS nights,
           b.BOOKING_STATUS                         AS bookingStatus,
           b.CHECK_IN_STATUS                        AS checkInStatus,
           b.GUESTS_COUNT                           AS guests,
           b.BED_COUNT                              AS bedCount,
           b.REMARKS                                AS remarks,
           b.EXTENDED                               AS extended,
           b.EXTENDED_DAYS                          AS extendedDays,
           b.LATE_CHECKOUT                          AS lateCheckout,
           b.HOLD_PENDING                           AS holdPending,
           COALESCE(bill.ROOM_CHARGE, 0)            AS roomRate,
           COALESCE(bill.DISCOUNT_AMOUNT, 0)        AS discount,
           COALESCE(bill.RESERVATION_FEE, 0)        AS reservationFee,
           COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS servicesTotal,
           COALESCE(bill.PAYMENT_STATUS, 'unpaid')  AS paymentStatus,
           (COALESCE(bill.ROOM_CHARGE, 0) * COALESCE(bill.QTY, 1)
             + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0)
             + COALESCE(bill.LATE_CHECKOUT_CHARGE, 0)
             - COALESCE(bill.DISCOUNT_AMOUNT, 0) - COALESCE(bill.RESERVATION_FEE, 0)) AS totalCost,
           COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p
              WHERE p.BOOKING_ID = b.IDNo
                AND p.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount', 'security_deposit', 'security_deposit_refund')), 0) AS paidAmount,
           COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p
              WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE = 'security_deposit'), 0) AS securityDeposit
         FROM booking b
         LEFT JOIN customer c   ON c.IDNo = b.CUSTOMER_ID
         LEFT JOIN room r       ON r.IDNo = b.ROOM_ID
         LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1
         WHERE b.IDNo = ?
         LIMIT 1`,
        [id]
      );
      if (!rows || !rows[0]) return null;
      const snap = rows[0];
      // Derived: balance = total - paid.
      snap.balance = Number(snap.totalCost || 0) - Number(snap.paidAmount || 0);
      return snap;
    } catch (err) {
      console.error('⚠️ ActivityLog.snapshotForAudit failed:', err.message);
      return null;
    }
  }

  /**
   * Room number + current guest for a room-centric action (no booking id).
   * roomKey may be a room IDNo or a room number. Never throws.
   */
  static async roomContext(roomKey) {
    if (roomKey === null || roomKey === undefined || roomKey === '') return null;
    try {
      const key = String(roomKey);
      const rows = await queryDatabasePromise(
        `SELECT
           r.ROOM_NUMBER AS roomNumber,
           r.ROOM_STATUS AS roomStatus,
           (SELECT c.NAME
              FROM booking b
              JOIN customer c ON c.IDNo = b.CUSTOMER_ID
             WHERE b.ROOM_ID = r.IDNo AND b.ACTIVE = 1
               AND CURDATE() >= DATE(b.CHECK_IN_DATE)
               AND CURDATE() <  DATE(b.CHECK_OUT_DATE)
             ORDER BY b.IDNo DESC LIMIT 1) AS guestName,
           (SELECT b2.IDNo
              FROM booking b2
             WHERE b2.ROOM_ID = r.IDNo AND b2.ACTIVE = 1
               AND CURDATE() >= DATE(b2.CHECK_IN_DATE)
               AND CURDATE() <  DATE(b2.CHECK_OUT_DATE)
             ORDER BY b2.IDNo DESC LIMIT 1) AS bookingId
         FROM room r
         WHERE r.IDNo = ? OR r.ROOM_NUMBER = ?
         LIMIT 1`,
        [key, key]
      );
      return rows && rows[0] ? rows[0] : null;
    } catch (err) {
      console.error('⚠️ ActivityLog.roomContext failed:', err.message);
      return null;
    }
  }

  // Numeric room-status code -> readable name.
  static roomStatusName(code) {
    const map = { 1: 'Available', 2: 'Occupied', 3: 'Under Maintenance', 4: 'Cleaning' };
    return map[Number(code)] || (code != null ? String(code) : null);
  }

  /**
   * Bookings that "Move to Occupied" is about to affect (checked-in, not yet
   * occupied). Call this BEFORE the bulk update. Never throws.
   */
  static async pendingCheckInsSnapshot() {
    try {
      const rows = await queryDatabasePromise(
        `SELECT b.IDNo AS bookingId, c.NAME AS guest, r.ROOM_NUMBER AS room
           FROM booking b
           LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
           LEFT JOIN room r     ON r.IDNo = b.ROOM_ID
          WHERE b.BOOKING_STATUS = 'check-In'
            AND b.IS_OCCUPIED = 0
            AND b.ACTIVE = 1
          ORDER BY r.ROOM_NUMBER`
      );
      return rows || [];
    } catch (err) {
      console.error('⚠️ ActivityLog.pendingCheckInsSnapshot failed:', err.message);
      return [];
    }
  }

  // Normalize a value for equality comparison in the diff.
  static _normForDiff(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  }

  /**
   * Compare two flat snapshots -> [{ field, label, from, to }] for changed keys only.
   */
  static diffSnapshots(before, after) {
    if (!before || !after) return [];
    const labels = this.FIELD_LABELS;
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes = [];
    for (const k of keys) {
      if (this._normForDiff(before[k]) !== this._normForDiff(after[k])) {
        changes.push({
          field: k,
          label: labels[k] || k,
          from: before[k] === undefined ? null : before[k],
          to: after[k] === undefined ? null : after[k]
        });
      }
    }
    return changes;
  }

  /**
   * Insert one audit-trail entry.
   * @param {Object} entry
   * @param {string} entry.action        Required. e.g. CREATE, UPDATE, DELETE, CHECK_IN, ROOM_TRANSFER
   * @param {string} [entry.module]      e.g. 'calendar', 'booking', 'room'
   * @param {string|number} [entry.bookingId]  related booking.IDNo (auto-derived from entityId when entityType='booking')
   * @param {string} [entry.entityType]  e.g. 'booking', 'booking_extension'
   * @param {string|number} [entry.entityId]
   * @param {string} [entry.description]
   * @param {*} [entry.oldData]          Snapshot before the change
   * @param {*} [entry.newData]          Snapshot / payload of the change
   * @param {'SUCCESS'|'FAILED'} [entry.status]
   * @param {string} [entry.errorMessage]
   * @param {number} [entry.amount]     peso amount involved, when applicable
   * @param {number} [entry.userId]
   * @param {string} [entry.userName]
   *
   * Note: entityType/entityId are accepted for backwards-compat but are only
   * used to derive BOOKING_ID; request context (ip/endpoint/agent) is ignored.
   */
  static async log(entry = {}) {
    try {
      const {
        action,
        module = 'general',
        bookingId = null,
        entityType = null,
        entityId = null,
        description = null,
        amount = null,
        oldData = null,
        newData = null,
        status = 'SUCCESS',
        errorMessage = null,
        userId = null,
        userName = null
      } = entry;

      if (!action) {
        console.warn('⚠️ ActivityLog.log called without an action, skipping');
        return;
      }

      // Resolve BOOKING_ID: explicit wins, otherwise reuse a numeric entityId
      // when the affected entity IS the booking.
      const resolvedBookingId =
        this._toId(bookingId) ||
        (String(entityType || '').toLowerCase() === 'booking' ? this._toId(entityId) : null);

      // Amount: explicit, else a monetary delta carried in newData.amount.
      let amt = null;
      const rawAmt = amount != null ? amount : (newData && typeof newData === 'object' ? newData.amount : null);
      if (rawAmt != null && rawAmt !== '') {
        const n = parseFloat(String(rawAmt).replace(/[, ]/g, ''));
        if (Number.isFinite(n)) amt = n;
      }

      await queryDatabasePromise(
        `INSERT INTO activity_log
           (MODULE, ACTION, BOOKING_ID, DESCRIPTION, AMOUNT,
            STATUS, ERROR_MESSAGE, USER_ID, USER_NAME, OLD_DATA, NEW_DATA)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this._clip(module, 50),
          this._clip(action, 60),
          resolvedBookingId,
          this._clip(description, 500),
          amt,
          status === 'FAILED' ? 'FAILED' : 'SUCCESS',
          this._clip(errorMessage, 500),
          userId || null,
          this._clip(userName, 150),
          this._toText(oldData),
          this._toText(newData)
        ]
      );
    } catch (err) {
      // Swallow - auditing must never break the main flow.
      console.error('⚠️ ActivityLog insert failed:', err.message);
    }
  }

  /**
   * Read back audit-trail rows with simple filters (for an admin viewer).
   * JOINs user_info so the actor's current FULLNAME is resolved from USER_ID;
   * falls back to the name snapshotted at write time, then 'System'.
   */
  static async getLogs(filters = {}) {
    try {
      const { module, action, bookingId, userId, status, search, dateFrom, dateTo } = filters;
      const where = [];
      const params = [];

      if (module) { where.push('al.MODULE = ?'); params.push(module); }
      if (action) { where.push('al.ACTION = ?'); params.push(action); }
      const bookingIdNum = this._toId(bookingId);
      if (bookingIdNum) { where.push('al.BOOKING_ID = ?'); params.push(bookingIdNum); }
      if (userId) { where.push('al.USER_ID = ?'); params.push(userId); }
      if (status) { where.push('al.STATUS = ?'); params.push(status); }
      if (dateFrom) { where.push('al.ENCODED_DT >= ?'); params.push(dateFrom); }
      if (dateTo) { where.push('al.ENCODED_DT <= ?'); params.push(dateTo); }
      if (search) {
        where.push(`(al.DESCRIPTION LIKE ? OR al.BOOKING_ID LIKE ?
                     OR ui.FULLNAME LIKE ? OR al.USER_NAME LIKE ?
                     OR c.NAME LIKE ? OR r.ROOM_NUMBER LIKE ?)`);
        const like = `%${search}%`;
        params.push(like, like, like, like, like, like);
      }

      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(parseInt(filters.limit, 10) || 200, 1000);
      const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);

      return await queryDatabasePromise(
        `SELECT
           al.IDNo, al.ENCODED_DT, al.MODULE, al.ACTION, al.BOOKING_ID,
           al.DESCRIPTION, al.AMOUNT, al.STATUS, al.ERROR_MESSAGE,
           al.USER_ID, al.USER_NAME, al.NEW_DATA,
           COALESCE(ui.FULLNAME, al.USER_NAME, 'System') AS PROCESSED_BY,
           c.NAME  AS BOOKING_GUEST_NAME,
           r.ROOM_NUMBER AS BOOKING_ROOM_NUMBER
         FROM activity_log al
         LEFT JOIN user_info ui ON ui.IDno = al.USER_ID
         LEFT JOIN booking  b  ON b.IDNo = al.BOOKING_ID
         LEFT JOIN customer c  ON c.IDNo = b.CUSTOMER_ID
         LEFT JOIN room     r  ON r.IDNo = b.ROOM_ID
         ${clause}
         ORDER BY al.IDNo DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );
    } catch (err) {
      console.error('⚠️ ActivityLog.getLogs failed:', err.message);
      return [];
    }
  }

  // Distinct values for the viewer's filter dropdowns.
  static async getFilterOptions() {
    try {
      const [modules, actions] = await Promise.all([
        queryDatabasePromise(`SELECT DISTINCT MODULE FROM activity_log ORDER BY MODULE`),
        queryDatabasePromise(`SELECT DISTINCT ACTION FROM activity_log ORDER BY ACTION`)
      ]);
      return {
        modules: modules.map(r => r.MODULE).filter(Boolean),
        actions: actions.map(r => r.ACTION).filter(Boolean)
      };
    } catch (err) {
      console.error('⚠️ ActivityLog.getFilterOptions failed:', err.message);
      return { modules: [], actions: [] };
    }
  }
}

module.exports = ActivityLogModel;
