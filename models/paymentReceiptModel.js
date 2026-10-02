const { queryDatabasePromise } = require('../config/database');

class PaymentReceiptModel {
  static async getAll(propertyId) {
    return await queryDatabasePromise(
      `SELECT
        pr.IDNo,
        pr.RECEIPT_NO,
        pr.ROOM_NO,
        pr.RECEIPT_DATE,
        pr.RECEIVED_FROM,
        pr.AMOUNT_PAID,
        pr.PAYMENT_METHOD,
        pr.PAYMENT_METHOD_OTHER,
        pr.PURPOSE,
        pr.RECEIVED_BY,
        pr.ENCODED_BY,
        pr.ENCODED_DT,
        pr.EDITED_BY,
        pr.EDITED_DT,
        u.FULLNAME AS ENCODED_BY_NAME
      FROM payment_receipt pr
      LEFT JOIN user_info u ON u.IDNo = pr.ENCODED_BY
      WHERE pr.ACTIVE = 1 AND pr.PROPERTY_ID = ?
      ORDER BY pr.RECEIPT_DATE DESC, pr.IDNo DESC`,
      [propertyId]
    );
  }

  static async getById(id, propertyId) {
    const rows = await queryDatabasePromise(
      `SELECT *
       FROM payment_receipt
       WHERE IDNo = ? AND PROPERTY_ID = ? AND ACTIVE = 1`,
      [id, propertyId]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const query = `
      INSERT INTO payment_receipt
      (RECEIPT_NO, ROOM_NO, RECEIPT_DATE, RECEIVED_FROM, AMOUNT_PAID, PAYMENT_METHOD,
       PAYMENT_METHOD_OTHER, PURPOSE, RECEIVED_BY, ENCODED_BY, ENCODED_DT, ACTIVE, PROPERTY_ID)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `;
    const result = await queryDatabasePromise(query, [
      data.RECEIPT_NO,
      data.ROOM_NO,
      data.RECEIPT_DATE,
      data.RECEIVED_FROM,
      data.AMOUNT_PAID,
      data.PAYMENT_METHOD,
      data.PAYMENT_METHOD_OTHER,
      data.PURPOSE,
      data.RECEIVED_BY,
      data.ENCODED_BY,
      data.ENCODED_DT,
      data.PROPERTY_ID
    ]);
    return { id: result.insertId, ...data };
  }

  static async updateReceiptNo(id, receiptNo) {
    return await queryDatabasePromise(
      `UPDATE payment_receipt SET RECEIPT_NO = ? WHERE IDNo = ? AND ACTIVE = 1`,
      [receiptNo, id]
    );
  }

  static async update(data) {
    const query = `
      UPDATE payment_receipt
      SET RECEIPT_NO = ?,
          ROOM_NO = ?,
          RECEIPT_DATE = ?,
          RECEIVED_FROM = ?,
          AMOUNT_PAID = ?,
          PAYMENT_METHOD = ?,
          PAYMENT_METHOD_OTHER = ?,
          PURPOSE = ?,
          RECEIVED_BY = ?,
          EDITED_BY = ?,
          EDITED_DT = ?
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    return await queryDatabasePromise(query, [
      data.RECEIPT_NO,
      data.ROOM_NO,
      data.RECEIPT_DATE,
      data.RECEIVED_FROM,
      data.AMOUNT_PAID,
      data.PAYMENT_METHOD,
      data.PAYMENT_METHOD_OTHER,
      data.PURPOSE,
      data.RECEIVED_BY,
      data.EDITED_BY,
      data.EDITED_DT,
      data.IDNo
    ]);
  }

  static async delete(id, editedBy, propertyId) {
    return await queryDatabasePromise(
      `UPDATE payment_receipt
       SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW()
       WHERE IDNo = ? AND PROPERTY_ID = ? AND ACTIVE = 1`,
      [editedBy, id, propertyId]
    );
  }

  static async searchBookedGuests(searchQuery = '', propertyId) {
    const term = String(searchQuery || '').trim();
    const params = [propertyId];
    let searchCondition = '';

    if (term) {
      searchCondition = `
        AND (
          c.NAME LIKE ?
          OR r.ROOM_NUMBER LIKE ?
          OR b.CONFIRMATION_NUMBER LIKE ?
        )`;
      const pattern = `%${term}%`;
      params.push(pattern, pattern, pattern);
    }

    const query = `
      SELECT
        b.IDNo AS BOOKING_ID,
        c.NAME AS GUEST_NAME,
        r.ROOM_NUMBER,
        b.CONFIRMATION_NUMBER,
        b.CHECK_IN_DATE,
        b.CHECK_OUT_DATE
      FROM booking b
      INNER JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      WHERE b.ACTIVE = 1
        AND b.PROPERTY_ID = ?
        AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
        ${searchCondition}
      ORDER BY b.CHECK_IN_DATE DESC, c.NAME ASC
      LIMIT 100
    `;

    return await queryDatabasePromise(query, params);
  }
}

module.exports = PaymentReceiptModel;
