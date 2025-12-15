const { queryDatabasePromise } = require('../config/database');

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
}

module.exports = AgencyModel;

