const { pool, queryDatabase, queryDatabasePromise } = require('../config/database');

class GuestModel {
  // Time utility functions (following dashboard pattern)
  static timeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now - past) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  }

  // Fetch all active guests
  static async getAllGuests() {
    try {
      const query = `
        SELECT 
          c.IDNo, 
          c.NAME, 
          c.CONTACTNo, 
          c.TYPE, 
          c.LEVEL,
          c.IS_GROUP,
          c.ENCODED_DT AS CREATED_AT,
          gt.TYPE AS TYPE_NAME,
          gl.TYPE AS LEVEL_NAME,
          COUNT(b.IDNo) AS TOTAL_BOOKINGS,
          SUM(CASE WHEN b.BOOKING_STATUS = 'check-In' THEN 1 ELSE 0 END) AS ACTIVE_BOOKINGS
        FROM customer c
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        LEFT JOIN booking b ON c.IDNo = b.CUSTOMER_ID AND b.ACTIVE = 1
        WHERE c.ACTIVE = 1
        GROUP BY c.IDNo
        ORDER BY c.NAME ASC
      `;
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Fetch guest by ID
  static async getGuestById(id) {
    try {
      const query = `
        SELECT 
          c.IDNo, 
          c.NAME, 
          c.CONTACTNo, 
          c.TYPE, 
          c.LEVEL,
          c.IS_GROUP,
          c.ENCODED_DT AS CREATED_AT,
          gt.TYPE AS TYPE_NAME,
          gl.TYPE AS LEVEL_NAME
        FROM customer c
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        WHERE c.IDNo = ? AND c.ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [id]);
      return result[0];
    } catch (error) {
      throw error;
    }
  }

  // Fetch guest types
  static async getGuestTypes() {
    try {
      const query = 'SELECT IDNo, TYPE FROM guest_type ORDER BY TYPE ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Fetch guest levels
  static async getGuestLevels() {
    try {
      const query = 'SELECT IDNo, TYPE FROM guest_level ORDER BY TYPE ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Fetch guest statistics
  static async getGuestStatistics() {
    try {
      const queries = {
        totalGuests: `
          SELECT COUNT(*) AS totalGuests
          FROM customer 
          WHERE ACTIVE = 1
        `,
        activeBookings: `
          SELECT COUNT(DISTINCT c.IDNo) AS activeBookings
          FROM customer c
          JOIN booking b ON c.IDNo = b.CUSTOMER_ID
          WHERE c.ACTIVE = 1 AND b.ACTIVE = 1 AND b.BOOKING_STATUS = 'check-In'
        `,
        vipGuests: `
          SELECT COUNT(*) AS vipGuests
          FROM customer 
          WHERE ACTIVE = 1 AND LEVEL = 1
        `,
        groupGuests: `
          SELECT COUNT(*) AS groupGuests
          FROM customer 
          WHERE ACTIVE = 1 AND IS_GROUP = 1
        `,
        newGuestsThisMonth: `
          SELECT COUNT(*) AS newGuestsThisMonth
          FROM customer 
          WHERE ACTIVE = 1 
          AND MONTH(ENCODED_DT) = MONTH(CURDATE())
          AND YEAR(ENCODED_DT) = YEAR(CURDATE())
        `,
        guestTypes: `
          SELECT gt.TYPE, COUNT(c.IDNo) AS count
          FROM guest_type gt
          LEFT JOIN customer c ON gt.IDNo = c.TYPE AND c.ACTIVE = 1
          GROUP BY gt.IDNo
          ORDER BY count DESC
        `,
        guestLevels: `
          SELECT gl.TYPE, COUNT(c.IDNo) AS count
          FROM guest_level gl
          LEFT JOIN customer c ON gl.IDNo = c.LEVEL AND c.ACTIVE = 1
          GROUP BY gl.IDNo
          ORDER BY count DESC
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        results[key] = await queryDatabasePromise(query);
      }
      
      return results;
    } catch (error) {
      throw error;
    }
  }

  // Fetch guest booking details
  static async getGuestBookings(guestId) {
    try {
      const query = `
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CustomerName,
          c.IS_GROUP,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          rt.NAME AS ROOM_TYPE,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          bill.ROOM_CHARGE AS ROOM_RATE,
          COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS ORIGINAL_DAYS,
          COALESCE((
              SELECT SUM(QTY) 
              FROM booking_extension 
              WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1
          ), 0) AS EXTENDED_DAYS,
          COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS TOTAL_DAYS,
          (COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) +
          COALESCE((
              SELECT SUM(COST * QTY) 
              FROM booking_extension  
              WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1
          ), 0) AS TOTAL_ROOM_COST,
          (COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) AS ROOM_COST,
          (
              COALESCE((
                  SELECT SUM(p.AMOUNT_PAID) 
                  FROM payments p 
                  WHERE p.BILLING_ID = bill.IDNo
              ), 0) +
              COALESCE((
                  SELECT SUM(p2.AMOUNT_PAID) 
                  FROM payments p2 
                  WHERE p2.BOOKING_EXTENSION_ID IN (
                      SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1
                  )
              ), 0)
          ) AS TOTAL_PAID,
          CASE
              WHEN bill.PAYMENT_STATUS = 'paid' THEN 'paid'
              WHEN bill.PAYMENT_STATUS = 'unpaid' THEN 'unpaid'
              ELSE 'partial_paid'
          END AS PAYMENT_STATUS,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.BOOKING_STATUS,
          b.GUESTS_COUNT,
          b.REMARKS
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.CUSTOMER_ID = ? AND b.ACTIVE = 1
        ORDER BY b.CHECK_IN_DATE DESC
      `;
      const result = await queryDatabasePromise(query, [guestId]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Create new guest
  static async createGuest(NAME, CONTACTNo, TYPE, LEVEL) {
    try {
      const query = `
        INSERT INTO customer (NAME, CONTACTNo, TYPE, LEVEL, ACTIVE, ENCODED_DT, ENCODED_BY) 
        VALUES (?, ?, ?, ?, 1, NOW(), 'system')
      `;
      const result = await queryDatabasePromise(query, [NAME, CONTACTNo, TYPE, LEVEL]);
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  // Update guest
  static async updateGuest(IDNo, NAME, CONTACTNo, TYPE, LEVEL) {
    try {
      const query = 'UPDATE customer SET NAME = ?, CONTACTNo = ?, TYPE = ?, LEVEL = ? WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [NAME, CONTACTNo, TYPE, LEVEL, IDNo]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Delete guest (soft delete)
  static async deleteGuest(IDNo) {
    try {
      const query = 'UPDATE customer SET ACTIVE = 0 WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [IDNo]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Process guest data (following dashboard pattern)
  static processGuestData(guestsResults) {
    return guestsResults.map(guest => {
      // Format phone number
      const formatPhoneNumber = (phone) => {
        if (!phone || phone === 'N/A') return 'N/A';
        const cleaned = phone.toString().replace(/\D/g, '');
        if (cleaned.length === 11) {
          return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
        } else if (cleaned.length === 10) {
          return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
      };

      // Determine guest status
      let status = 'Inactive';
      let statusClass = 'label-default';
      
      if (guest.ACTIVE_BOOKINGS > 0) {
        status = 'Active';
        statusClass = 'label-success';
      } else if (guest.TOTAL_BOOKINGS > 0) {
        status = 'Past Guest';
        statusClass = 'label-info';
      } else {
        status = 'New Guest';
        statusClass = 'label-warning';
      }

      // Determine level badge
      let levelClass = 'label-default';
      switch(guest.LEVEL) {
        case 1:
          levelClass = 'label-danger';
          break;
        case 2:
          levelClass = 'label-warning';
          break;
        case 3:
          levelClass = 'label-info';
          break;
        default:
          levelClass = 'label-default';
      }

      return {
        ...guest,
        FORMATTED_PHONE: formatPhoneNumber(guest.CONTACTNo),
        STATUS: status,
        STATUS_CLASS: statusClass,
        LEVEL_CLASS: levelClass,
        IS_GROUP_TEXT: guest.IS_GROUP ? 'Group' : 'Individual',
        CREATED_AGO: guest.CREATED_AT ? GuestModel.timeAgo(guest.CREATED_AT) : 'N/A'
      };
    });
  }

  // Categorize guests by type
  static categorizeGuestsByType(guestsResults) {
    const categories = {};
    guestsResults.forEach(guest => {
      const type = guest.TYPE_NAME || 'Unknown';
      if (!categories[type]) {
        categories[type] = [];
      }
      categories[type].push(guest);
    });
    return categories;
  }

  // Categorize guests by level
  static categorizeGuestsByLevel(guestsResults) {
    const categories = {};
    guestsResults.forEach(guest => {
      const level = guest.LEVEL_NAME || 'Unknown';
      if (!categories[level]) {
        categories[level] = [];
      }
      categories[level].push(guest);
    });
    return categories;
  }

   // File Maintenance Methods

  // Get all guest types for file maintenance
  static async getAllGuestTypes() {
    try {
      const query = 'SELECT * FROM guest_type ORDER BY TYPE ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Get all guest levels for file maintenance
  static async getAllGuestLevels() {
    try {
      const query = 'SELECT * FROM guest_level ORDER BY TYPE ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Guest Type Methods
  static async addGuestType(TYPE, ACTIVE) {
    try {
      const query = 'INSERT INTO guest_type (TYPE, ACTIVE) VALUES (?, ?)';
      const result = await queryDatabasePromise(query, [TYPE, ACTIVE]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  static async getGuestTypeById(id) {
    try {
      const query = 'SELECT IDNo, TYPE, ACTIVE FROM guest_type WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [id]);
      return result[0] || null;
    } catch (error) {
      throw error;
    }
  }

  static async editGuestType(id, TYPE, ACTIVE) {
    try {
      const query = 'UPDATE guest_type SET TYPE = ?, ACTIVE = ? WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [TYPE, ACTIVE, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  static async toggleGuestType(id, ACTIVE) {
    try {
      const query = 'UPDATE guest_type SET ACTIVE = ? WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [ACTIVE, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  static async deleteGuestType(id) {
    try {
      const query = 'DELETE FROM guest_type WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Guest Level Methods
  static async addGuestLevel(TYPE, ACTIVE) {
    try {
      const query = 'INSERT INTO guest_level (TYPE, ACTIVE) VALUES (?, ?)';
      const result = await queryDatabasePromise(query, [TYPE, ACTIVE]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  static async getGuestLevelById(id) {
    try {
      const query = 'SELECT IDNo, TYPE, ACTIVE FROM guest_level WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [id]);
      return result[0] || null;
    } catch (error) {
      throw error;
    }
  }

  static async editGuestLevel(id, TYPE, ACTIVE) {
    try {
      const query = 'UPDATE guest_level SET TYPE = ?, ACTIVE = ? WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [TYPE, ACTIVE, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  static async toggleGuestLevel(id, ACTIVE) {
    try {
      const query = 'UPDATE guest_level SET ACTIVE = ? WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [ACTIVE, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  static async deleteGuestLevel(id) {
    try {
      const query = 'DELETE FROM guest_level WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GuestModel; 