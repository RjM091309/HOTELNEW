const { queryDatabasePromise } = require('../config/database');

class PickupDropModel {
  static async getAll() {
    const query = `
      SELECT
        b.IDNo AS BOOKING_ID,
        c.NAME,
        b.FLIGHT_NUMBER,
        b.DROPOFF_FLIGHT_NUMBER,
        b.CONFIRMATION_NUMBER,
        b.CHECK_IN_DATE,
        b.CHECK_OUT_DATE,
        b.BOOKING_STATUS,
        b.PASSENGER_COUNT,
        b.PICKUP_DROP_SPECIAL_NOTES,
        MAX(CASE WHEN LOWER(s.SERVICE_NAME) LIKE '%pick%' THEN 1 ELSE 0 END) AS HAS_PICKUP,
        MAX(CASE WHEN LOWER(s.SERVICE_NAME) LIKE '%drop%' THEN 1 ELSE 0 END) AS HAS_DROPOFF
      FROM booking b
      INNER JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      INNER JOIN booking_service bs ON bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1
      INNER JOIN services s ON s.IDNo = bs.SERVICE_ID
      WHERE b.ACTIVE = 1
        AND s.SERVICE_CATEGORY = 'Pick & Drop'
      GROUP BY
        b.IDNo,
        c.NAME,
        b.FLIGHT_NUMBER,
        b.DROPOFF_FLIGHT_NUMBER,
        b.CONFIRMATION_NUMBER,
        b.CHECK_IN_DATE,
        b.CHECK_OUT_DATE,
        b.BOOKING_STATUS,
        b.PASSENGER_COUNT,
        b.PICKUP_DROP_SPECIAL_NOTES
      ORDER BY b.CHECK_IN_DATE DESC, b.IDNo DESC
    `;
    return await queryDatabasePromise(query);
  }

  static async getByBookingId(bookingId) {
    const query = `
      SELECT
        b.IDNo AS BOOKING_ID,
        c.NAME,
        b.FLIGHT_NUMBER,
        b.DROPOFF_FLIGHT_NUMBER,
        b.PASSENGER_COUNT,
        b.PICKUP_DROP_SPECIAL_NOTES
      FROM booking b
      INNER JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      WHERE b.IDNo = ? AND b.ACTIVE = 1
    `;
    const results = await queryDatabasePromise(query, [bookingId]);
    return results[0] || null;
  }

  static async updateBooking(bookingId, data) {
    const query = `
      UPDATE booking
      SET FLIGHT_NUMBER = ?, DROPOFF_FLIGHT_NUMBER = ?, PASSENGER_COUNT = ?, PICKUP_DROP_SPECIAL_NOTES = ?, EDITED_BY = ?, EDITED_DT = ?
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    return await queryDatabasePromise(query, [
      data.FLIGHT_NUMBER,
      data.DROPOFF_FLIGHT_NUMBER,
      data.PASSENGER_COUNT,
      data.PICKUP_DROP_SPECIAL_NOTES,
      data.EDITED_BY,
      data.EDITED_DT,
      bookingId
    ]);
  }

  static async removePickDropServices(bookingId, editedBy) {
    const query = `
      UPDATE booking_service bs
      INNER JOIN services s ON s.IDNo = bs.SERVICE_ID
      SET bs.ACTIVE = 0, bs.EDITED_BY = ?, bs.EDITED_DT = NOW()
      WHERE bs.BOOKING_ID = ?
        AND bs.ACTIVE = 1
        AND s.SERVICE_CATEGORY = 'Pick & Drop'
    `;
    return await queryDatabasePromise(query, [editedBy, bookingId]);
  }
}

module.exports = PickupDropModel;
