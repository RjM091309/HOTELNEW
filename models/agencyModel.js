const { queryDatabasePromise, pool } = require('../config/database');

class AgencyModel {
  // Get all active agencies with booking counts
  static async getAllAgencies() {
    try {
      const query = `
        SELECT 
          a.IDNo,
          a.NAME,
          a.CONTACT_NUMBER,
          a.ENCODED_BY,
          a.ENCODED_DT,
          a.EDITED_BY,
          a.EDITED_DT,
          a.ACTIVE,
          COALESCE(bk.totalBookings, 0) AS totalBookings
        FROM agency a
        LEFT JOIN (
          SELECT AGENCY_ID, COUNT(*) AS totalBookings
          FROM booking
          WHERE ACTIVE = 1
          GROUP BY AGENCY_ID
        ) bk ON bk.AGENCY_ID = a.IDNo
        WHERE a.ACTIVE = 1 
        ORDER BY a.NAME ASC
      `;
      return await queryDatabasePromise(query);
    } catch (error) {
      console.error('Error in getAllAgencies:', error);
      throw error;
    }
  }

  // Get agency by ID
  static async getAgencyById(id) {
    try {
      const query = `
        SELECT 
          a.IDNo,
          a.NAME,
          a.CONTACT_NUMBER,
          a.ENCODED_BY,
          a.ENCODED_DT,
          a.EDITED_BY,
          a.EDITED_DT,
          a.ACTIVE,
          COALESCE(bk.totalBookings, 0) AS totalBookings
        FROM agency a
        LEFT JOIN (
          SELECT AGENCY_ID, COUNT(*) AS totalBookings
          FROM booking
          WHERE ACTIVE = 1
          GROUP BY AGENCY_ID
        ) bk ON bk.AGENCY_ID = a.IDNo
        WHERE a.IDNo = ? AND a.ACTIVE = 1
      `;
      const results = await queryDatabasePromise(query, [id]);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Error in getAgencyById:', error);
      throw error;
    }
  }

  // Add new agency
  static async addAgency(name, contactNumber, encodedBy) {
    try {
      const query = `
        INSERT INTO agency (NAME, CONTACT_NUMBER, ENCODED_BY, ENCODED_DT, ACTIVE)
        VALUES (?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [name, contactNumber || null, encodedBy]);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error('Error in addAgency:', error);
      throw error;
    }
  }

  // Update existing agency
  static async updateAgency(id, name, contactNumber, editedBy) {
    try {
      const query = `
        UPDATE agency
        SET NAME = ?, CONTACT_NUMBER = ?, EDITED_BY = ?, EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [name, contactNumber || null, editedBy, id]);
      if (result.affectedRows === 0) {
        return { success: false, notFound: true };
      } else {
        return { success: true };
      }
    } catch (error) {
      console.error('Error in updateAgency:', error);
      throw error;
    }
  }

  // Soft delete agency
  static async deleteAgency(agencyId) {
    try {
      // Check if agency is used in any bookings
      const checkUsageQuery = `
        SELECT COUNT(*) as count 
        FROM booking 
        WHERE AGENCY_ID = ? AND ACTIVE = 1
      `;
      const usageResult = await queryDatabasePromise(checkUsageQuery, [agencyId]);
      const usageCount = usageResult[0]?.count || 0;

      if (usageCount > 0) {
        return { 
          success: false, 
          hasBookings: true, 
          message: `Cannot delete agency. It is used in ${usageCount} active booking(s).` 
        };
      }

      // Soft delete if no bookings
      const query = 'UPDATE agency SET ACTIVE = 0 WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [agencyId]);
      if (result.affectedRows === 0) {
        return { success: false, notFound: true };
      } else {
        return { success: true };
      }
    } catch (error) {
      console.error('Error in deleteAgency:', error);
      throw error;
    }
  }

  // Check if agency name already exists (for validation)
  static async checkAgencyNameExists(name, excludeId = null) {
    try {
      let query = `
        SELECT COUNT(*) as count 
        FROM agency 
        WHERE NAME = ? AND ACTIVE = 1
      `;
      const params = [name];
      
      if (excludeId) {
        query += ' AND IDNo != ?';
        params.push(excludeId);
      }
      
      const result = await queryDatabasePromise(query, params);
      return (result[0]?.count || 0) > 0;
    } catch (error) {
      console.error('Error in checkAgencyNameExists:', error);
      throw error;
    }
  }

  // Get bookings for a specific agency
  static async getAgencyBookings(agencyId) {
    try {
      const query = `
        SELECT 
          b.IDNo AS bookingId,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_STATUS,
          b.BOOKING_CHANNEL,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          bill.PAYMENT_STATUS,
          r.ROOM_NUMBER,
          c.NAME AS CUSTOMER_NAME
        FROM booking b
        LEFT JOIN room r ON r.IDNo = b.ROOM_ID
        LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        WHERE b.ACTIVE = 1
          AND b.AGENCY_ID = ?
        ORDER BY b.CHECK_IN_DATE DESC, b.IDNo DESC
      `;
      return await queryDatabasePromise(query, [agencyId]);
    } catch (error) {
      console.error('Error in getAgencyBookings:', error);
      throw error;
    }
  }

  // Get data for agency-wide voucher / statement
  static async getAgencyVoucherData(agencyId, filterType, fromDate, toDate) {
    try {
      const useCheckIn = (filterType || '').toLowerCase() === 'checkin';
      const dateColumn = useCheckIn ? 'DATE(b.CHECK_IN_DATE)' : 'DATE(b.ENCODED_DT)';

      const query = `
        SELECT
          a.NAME AS agencyName,
          b.IDNo AS bookingId,
          c.NAME AS guest,
          r.ROOM_NUMBER AS room,
          b.CONFIRMATION_NUMBER AS confirmationNumber,
          DATE_FORMAT(b.ENCODED_DT, '%b %e, %Y') AS reservationDate,
          DATE_FORMAT(b.CHECK_IN_DATE, '%b %e, %Y') AS checkIn,
          DATE_FORMAT(b.CHECK_OUT_DATE, '%b %e, %Y') AS checkOut,
          b.BOOKING_STATUS AS bookingStatus,
          bill.PAYMENT_STATUS AS paymentStatus,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) AS roomTotal,
          COALESCE(services_total.TOTAL_SERVICES_COST, 0) AS servicesTotal,
          COALESCE(extensions_total.TOTAL_EXTENSIONS_COST, 0) AS extensionsTotal,
          COALESCE(bill.CANCELLATION_PENALTY, 0) AS penalty,
          COALESCE(bill.RESERVATION_FEE, 0) AS reservationFee,
          COALESCE(bill.DISCOUNT_AMOUNT, 0) AS discountAmount,
          COALESCE(payments_total.TOTAL_PAID, 0) AS paidAmount
        FROM booking b
        INNER JOIN agency a ON a.IDNo = b.AGENCY_ID
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        LEFT JOIN (
          SELECT 
            bs.BOOKING_ID,
            SUM(bs.TOTAL_COST) AS TOTAL_SERVICES_COST
          FROM booking_service bs
          WHERE bs.ACTIVE = 1
          GROUP BY bs.BOOKING_ID
        ) services_total ON services_total.BOOKING_ID = b.IDNo
        LEFT JOIN (
          SELECT 
            be.BOOKING_ID,
            SUM(be.QTY * be.COST) AS TOTAL_EXTENSIONS_COST
          FROM booking_extension be
          WHERE be.ACTIVE = 1
          GROUP BY be.BOOKING_ID
        ) extensions_total ON extensions_total.BOOKING_ID = b.IDNo
        LEFT JOIN (
          SELECT 
            p.BOOKING_ID,
            SUM(CASE WHEN p.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount') THEN p.AMOUNT_PAID ELSE 0 END) AS TOTAL_PAID
          FROM payments p
          WHERE p.BOOKING_ID IS NOT NULL
          GROUP BY p.BOOKING_ID
        ) payments_total ON payments_total.BOOKING_ID = b.IDNo
        WHERE 
          b.ACTIVE = 1
          AND b.AGENCY_ID = ?
          AND ${dateColumn} BETWEEN ? AND ?
        ORDER BY b.CHECK_IN_DATE ASC, b.IDNo ASC
      `;

      const rows = await queryDatabasePromise(query, [agencyId, fromDate, toDate]);

      if (!rows || rows.length === 0) {
        return {
          agencyName: '',
          bookings: [],
          totals: {
            totalAmount: 0,
            totalPaid: 0,
            totalBalance: 0
          }
        };
      }

      let grandTotalAmount = 0;
      let grandTotalPaid = 0;
      let grandTotalBalance = 0;

      const bookings = rows.map((row) => {
        const roomTotal = parseFloat(row.roomTotal || 0);
        const servicesTotal = parseFloat(row.servicesTotal || 0);
        const extensionsTotal = parseFloat(row.extensionsTotal || 0);
        const penalty = parseFloat(row.penalty || 0);
        const reservationFee = parseFloat(row.reservationFee || 0);
        const discountAmount = parseFloat(row.discountAmount || 0);
        const paidAmount = parseFloat(row.paidAmount || 0);
        const isCancelled = (row.bookingStatus || '').toLowerCase() === 'cancelled';

        // Calculate effectiveSubTotal (same logic as getBilling)
        const baseChargeSubTotal = roomTotal + servicesTotal + extensionsTotal;
        const subTotal = baseChargeSubTotal + penalty;
        const effectiveSubTotal = isCancelled ? baseChargeSubTotal : subTotal;

        // If cancelled with penalty, treat penalty as total and balance 0
        let bookingTotal, balance;
        if (penalty > 0) {
          bookingTotal = penalty;
          balance = 0;
        } else {
          // Same calculation as fetchBillingAndPayments
          bookingTotal = Math.max(0, effectiveSubTotal - reservationFee - discountAmount);
          balance = Math.max(0, bookingTotal - paidAmount);
        }

        grandTotalAmount += bookingTotal;
        grandTotalPaid += paidAmount;
        grandTotalBalance += balance;

        return {
          guest: row.guest || '-',
          room: row.room || '-',
          confirmation: row.confirmationNumber || '-',
          reservationDate: row.reservationDate || '-',
          checkIn: row.checkIn || '-',
          checkOut: row.checkOut || '-',
          total: bookingTotal,
          paid: paidAmount,
          balance,
          paymentStatus: row.paymentStatus || '-',
          bookingStatus: row.bookingStatus || '-'
        };
      });

      return {
        agencyName: rows[0]?.agencyName || '',
        bookings,
        totals: {
          totalAmount: grandTotalAmount,
          totalPaid: grandTotalPaid,
          totalBalance: grandTotalBalance
        }
      };
    } catch (error) {
      console.error('Error in getAgencyVoucherData:', error);
      throw error;
    }
  }

  // Bulk pay multiple bookings for an agency in one transaction
  static async bulkPay({ agencyId, bookingIds = [], amount, paymentMethod, remarks, encodedBy }) {
    const conn = await pool.promise().getConnection();
    try {
      await conn.beginTransaction();

      const reference = `AGYBP-${Date.now()}-${agencyId}`;
      const paymentType = 'room'; // use allowed payment type to ensure column is populated

      // Validate agency
      const [agencyRows] = await conn.query(
        'SELECT IDNo FROM agency WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1',
        [agencyId]
      );
      if (agencyRows.length === 0) {
        throw new Error('Agency not found or inactive.');
      }

      // Build booking filter
      let bookingFilterSql = '';
      const params = [agencyId];
      if (bookingIds && bookingIds.length > 0) {
        bookingFilterSql = ' AND b.IDNo IN (?)';
        params.push(bookingIds);
      }

      // Fetch unpaid bookings with balances
      const [rows] = await conn.query(
        `
        SELECT
          b.IDNo AS bookingId,
          bill.IDNo AS billingId,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) AS roomTotal,
          COALESCE(svc.total_services, 0) AS servicesTotal,
          COALESCE(ext.total_extensions, 0) AS extensionsTotal,
          COALESCE(bill.CANCELLATION_PENALTY, 0) AS penalty,
          COALESCE(bill.RESERVATION_FEE, 0) AS reservationFee,
          COALESCE(bill.DISCOUNT_AMOUNT, 0) AS discountAmount,
          COALESCE(pay.total_paid, 0) AS totalPaid
        FROM booking b
        JOIN billing bill ON bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1
        LEFT JOIN (
          SELECT BOOKING_ID, SUM(TOTAL_COST) AS total_services
          FROM booking_service
          WHERE ACTIVE = 1
          GROUP BY BOOKING_ID
        ) svc ON svc.BOOKING_ID = b.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, SUM(QTY * COST) AS total_extensions
          FROM booking_extension
          WHERE ACTIVE = 1
          GROUP BY BOOKING_ID
        ) ext ON ext.BOOKING_ID = b.IDNo
        LEFT JOIN (
          SELECT BOOKING_ID, SUM(CASE WHEN PAYMENT_TYPE NOT IN ('reservation_fee','discount') THEN AMOUNT_PAID ELSE 0 END) AS total_paid
          FROM payments
          GROUP BY BOOKING_ID
        ) pay ON pay.BOOKING_ID = b.IDNo
        WHERE b.ACTIVE = 1
          AND b.AGENCY_ID = ?
          ${bookingFilterSql}
        ORDER BY b.CHECK_IN_DATE ASC, b.IDNo ASC
        `,
        params
      );

      // Compute balances and filter unpaid
      const bookings = rows
        .map((row) => {
          const totalAmount =
            (parseFloat(row.roomTotal) || 0) +
            (parseFloat(row.servicesTotal) || 0) +
            (parseFloat(row.extensionsTotal) || 0) +
            (parseFloat(row.penalty) || 0) -
            (parseFloat(row.reservationFee) || 0) -
            (parseFloat(row.discountAmount) || 0);
          const totalPaid = parseFloat(row.totalPaid) || 0;
          const balance = Math.max(0, totalAmount - totalPaid);
          return {
            bookingId: row.bookingId,
            billingId: row.billingId,
            totalAmount,
            totalPaid,
            balance
          };
        })
        .filter((b) => b.balance > 0);

      if (bookings.length === 0) {
        throw new Error('No unpaid bookings found for this agency.');
      }

      const totalBalance = bookings.reduce((s, b) => s + b.balance, 0);
      const amountToAllocate = Math.min(amount, totalBalance);
      let remaining = amountToAllocate;

      const summaries = [];

      for (const booking of bookings) {
        if (remaining <= 0) break;
        const applyAmount = Math.min(booking.balance, remaining);
        if (applyAmount <= 0) continue;

        // Insert payment entry
        await conn.query(
          `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
           VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
          [booking.bookingId, booking.billingId, applyAmount, paymentMethod, paymentType, encodedBy, remarks]
        );

        const newPaid = booking.totalPaid + applyAmount;
        const newBalance = Math.max(0, booking.totalAmount - newPaid);
        const newStatus = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

        // Update billing payment status
        await conn.query(
          'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
          [newStatus, booking.billingId]
        );

        // If fully paid, mark services and extensions as paid
        if (newBalance <= 0) {
          await conn.query(
            'UPDATE booking_service SET STATUS = \'paid\' WHERE BOOKING_ID = ? AND ACTIVE = 1 AND STATUS != \'paid\'',
            [booking.bookingId]
          );
          await conn.query(
            'UPDATE booking_extension SET PAYMENT_STATUS = \'paid\' WHERE BOOKING_ID = ? AND ACTIVE = 1 AND PAYMENT_STATUS != \'paid\'',
            [booking.bookingId]
          );
        }

        summaries.push({
          bookingId: booking.bookingId,
          applied: applyAmount,
          previousBalance: booking.balance,
          remainingBalance: newBalance,
          paymentStatus: newStatus
        });

        remaining -= applyAmount;
      }

      await conn.commit();

      return {
        appliedTotal: amountToAllocate - remaining,
        unallocatedAmount: remaining,
        bookings: summaries,
        reference,
        paymentMethod,
        remarks
      };
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore rollback errors */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  // Data for bulk payment receipt
  static async getBulkPaymentReceiptData(agencyId, bookingIds = []) {
    if (!bookingIds.length) return [];
    const [rows] = await pool.promise().query(
      `
      SELECT
        b.IDNo AS bookingId,
        b.BOOKING_STATUS,
        b.BOOKING_CHANNEL,
        b.ENCODED_DT AS BOOKING_DATE,
        b.CONFIRMATION_NUMBER,
        c.NAME AS guestName,
        r.ROOM_NUMBER,
        a.NAME AS AGENCY_NAME,
        bill.PAYMENT_STATUS,
        COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) AS roomTotal,
        COALESCE(bill.DISCOUNT_AMOUNT, 0) AS discountAmount,
        COALESCE(bill.RESERVATION_FEE, 0) AS reservationFee,
        COALESCE((
          SELECT SUM(AMOUNT_PAID) FROM payments p
          WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'
        ), 0) AS totalPaid,
        COALESCE((
          SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1
        ), 0) AS servicesTotal,
        COALESCE((
          SELECT SUM(be.QTY * be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1
        ), 0) AS extensionsTotal,
        COALESCE(bill.CANCELLATION_PENALTY, 0) AS penalty
      FROM booking b
      INNER JOIN agency a ON a.IDNo = b.AGENCY_ID
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
      WHERE b.AGENCY_ID = ? AND b.IDNo IN (?)
      `,
      [agencyId, bookingIds]
    );
    return rows;
  }
}

module.exports = AgencyModel;

