// ========================================
// ROOM MODEL
// ========================================

const { pool, queryDatabase, queryDatabasePromise } = require('../config/database');

class RoomModel {
  
  // ========================================
  // ROOM CRUD OPERATIONS
  // ========================================
  
  // Fetch all active rooms with related data
  static async getAllRooms() {
    try {
      const query = `
        SELECT 
          r.IDNo,
          r.ROOM_TYPE_ID,
          rt.NAME AS ROOM_TYPE_NAME,
          r.ROOM_NUMBER,
          r.ROOM_STATUS,
          r.ROOM_MAINTENANCE_STATUS,
          NULL AS ROOM_PRICE,
          r.ROOM_MAX,
          r.ROOM_BED,
          r.ROOM_SIZE,
          r.ROOM_VIEW,
          r.ROOM_DESCRIPTION,
          r.ROOM_IMAGE,
          r.ENCODED_BY,
          r.ENCODED_DT,
          r.EDITED_BY,
          r.EDITED_DT,
          r.ACTIVE
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ACTIVE = 1
        ORDER BY r.ROOM_NUMBER ASC
      `;
      const rooms = await queryDatabasePromise(query);
      
      // Get amenities for each room
      for (let room of rooms) {
        const amenitiesQuery = `
          SELECT a.IDNo, a.NAME, a.DESCRIPTION, a.IS_PAID, a.COST
          FROM room_amenities ra
          LEFT JOIN amenity a ON ra.AMENITY_ID = a.IDNo
          WHERE ra.ROOM_ID = ? AND ra.ACTIVE = 1 AND a.ACTIVE = 1
          ORDER BY a.NAME ASC
        `;
        const amenities = await queryDatabasePromise(amenitiesQuery, [room.IDNo]);
        room.AMENITIES = amenities;
      }
      
      return rooms;
    } catch (error) {
      throw error;
    }
  }

  // Fetch room by ID
  static async getRoomById(id) {
    try {
      const query = `
        SELECT 
          r.IDNo,
          r.ROOM_TYPE_ID,
          rt.NAME AS ROOM_TYPE_NAME,
          r.ROOM_NUMBER,
          r.ROOM_STATUS,
          r.ROOM_MAINTENANCE_STATUS,
          NULL AS ROOM_PRICE,
          r.ROOM_MAX,
          r.ROOM_BED,
          r.ROOM_SIZE,
          r.ROOM_VIEW,
          r.ROOM_DESCRIPTION,
          r.ROOM_IMAGE,
          r.ENCODED_BY,
          r.ENCODED_DT,
          r.EDITED_BY,
          r.EDITED_DT,
          r.ACTIVE
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.IDNo = ? AND r.ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [id]);
      
      if (result.length > 0) {
        const room = result[0];
        
        // Get amenities for this room
        const amenitiesQuery = `
          SELECT a.IDNo, a.NAME, a.DESCRIPTION, a.IS_PAID, a.COST
          FROM room_amenities ra
          LEFT JOIN amenity a ON ra.AMENITY_ID = a.IDNo
          WHERE ra.ROOM_ID = ? AND ra.ACTIVE = 1 AND a.ACTIVE = 1
          ORDER BY a.NAME ASC
        `;
        const amenities = await queryDatabasePromise(amenitiesQuery, [room.IDNo]);
        room.AMENITIES = amenities;
        
        // Seasonal pricing removed - room pricing now comes from room_rates
        room.SEASONAL_PRICES = [];

        return room;
      }
      return null;
    } catch (error) {
      throw error;
    }
  }

  // Fetch room by room number
  static async getRoomByNumber(roomNumber) {
    try {
      const query = `
        SELECT IDNo, ROOM_NUMBER
        FROM room
        WHERE ROOM_NUMBER = ? AND ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [roomNumber]);
      return result[0];
    } catch (error) {
      throw error;
    }
  }

  // Create new room  (pricing lives in room_rates - no per-room price / seasonal price)
  static async createRoom(ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
                         ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW,
                         ROOM_DESCRIPTION, ROOM_IMAGE = null, AMENITIES = [], encodedBy) {
    try {
      const query = `
        INSERT INTO room (
          ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
          ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW,
          ROOM_DESCRIPTION, ROOM_IMAGE, ENCODED_BY, ENCODED_DT, ACTIVE
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [
        ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
        ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW,
        ROOM_DESCRIPTION, ROOM_IMAGE, encodedBy
      ]);

      const roomId = result.insertId;

      // Add amenities if provided
      if (AMENITIES && AMENITIES.length > 0) {
        for (const amenityId of AMENITIES) {
          await queryDatabasePromise(
            'INSERT INTO room_amenities (ROOM_ID, AMENITY_ID, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, ?, ?, NOW(), 1)',
            [roomId, amenityId, encodedBy]
          );
        }
      }

      return roomId;
    } catch (error) {
      throw error;
    }
  }

  // Update room  (pricing lives in room_rates - no per-room price / seasonal price)
  static async updateRoom(IDNo, ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
                         ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW,
                         ROOM_DESCRIPTION, ROOM_IMAGE = null, AMENITIES = [], editedBy) {
    try {
      // Build update query dynamically based on whether image is provided
      let query = `
        UPDATE room SET
          ROOM_TYPE_ID = ?, ROOM_NUMBER = ?, ROOM_STATUS = ?,
          ROOM_MAX = ?, ROOM_BED = ?, ROOM_SIZE = ?, ROOM_VIEW = ?,
          ROOM_DESCRIPTION = ?, EDITED_BY = ?, EDITED_DT = NOW()
      `;

      let params = [
        ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
        ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW,
        ROOM_DESCRIPTION, editedBy
      ];
      
      // Add image to update if provided
      if (ROOM_IMAGE) {
        query += ', ROOM_IMAGE = ?';
        params.push(ROOM_IMAGE);
      }
      
      query += ' WHERE IDNo = ? AND ACTIVE = 1';
      params.push(IDNo);
      
      const result = await queryDatabasePromise(query, params);
      
      if (result.affectedRows === 0) {
        return false;
      }
      
      // Update amenities
      // First, deactivate all existing amenities
      await queryDatabasePromise(
        'UPDATE room_amenities SET ACTIVE = 0, ENCODED_BY = ?, ENCODED_DT = NOW() WHERE ROOM_ID = ?',
        [editedBy, IDNo]
      );
      
      // Then add new amenities if provided
      if (AMENITIES && AMENITIES.length > 0) {
        for (const amenityId of AMENITIES) {
          await queryDatabasePromise(
            'INSERT INTO room_amenities (ROOM_ID, AMENITY_ID, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, ?, ?, NOW(), 1)',
            [IDNo, amenityId, editedBy]
          );
        }
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  }



  // Delete room (soft delete)
  static async deleteRoom(id, editedBy) {
    try {
      const query = 'UPDATE room SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [editedBy, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // ROOM TYPE CRUD OPERATIONS
  // ========================================
  
  // Get room type by ID
  static async getRoomTypeById(id) {
    try {
      const query = 'SELECT IDNo, NAME, DESCRIPTION, BASE_PRICE FROM room_type WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [id]);
      return result[0];
    } catch (error) {
      throw error;
    }
  }

  // Create room type. BASE_PRICE no longer used - pricing lives in room_rates,
  // keyed by room_rates.ROOM_TYPE_ID -> room_type.IDNo.
  static async createRoomType(NAME, DESCRIPTION, encodedBy) {
    try {
      const query = `
        INSERT INTO room_type (NAME, DESCRIPTION, ENCODED_BY, ENCODED_DT, ACTIVE)
        VALUES (?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [NAME, DESCRIPTION, encodedBy]);
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  // Update room type. BASE_PRICE no longer used - pricing lives in room_rates,
  // keyed by room_rates.ROOM_TYPE_ID -> room_type.IDNo.
  static async updateRoomType(IDNo, NAME, DESCRIPTION, editedBy) {
    try {
      const query = `
        UPDATE room_type
        SET NAME = ?, DESCRIPTION = ?, EDITED_BY = ?, EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [NAME, DESCRIPTION, editedBy, IDNo]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Delete room type (soft delete)
  static async deleteRoomType(id, editedBy) {
    try {
      const query = 'UPDATE room_type SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [editedBy, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Room types with their available (active, not under maintenance) room count, for Channex sync
  static async getRoomTypesForChannexSync() {
    try {
      const query = `
        SELECT
          rt.IDNo,
          rt.NAME,
          rt.DESCRIPTION,
          rt.BASE_PRICE,
          rt.CHANNEX_ROOM_TYPE_ID,
          (
            SELECT COUNT(*) FROM room r
            WHERE r.ROOM_TYPE_ID = rt.IDNo
              AND r.ACTIVE = 1
              AND (r.ROOM_MAINTENANCE_STATUS IS NULL OR r.ROOM_MAINTENANCE_STATUS != 'Under Maintenance')
          ) AS AVAILABLE_ROOM_COUNT
        FROM room_type rt
        WHERE rt.ACTIVE = 1
        ORDER BY rt.NAME ASC
      `;
      return await queryDatabasePromise(query);
    } catch (error) {
      throw error;
    }
  }

  // Persist the linked Channex room_type id after a successful sync
  static async setChannexRoomTypeId(id, channexRoomTypeId) {
    try {
      const query = 'UPDATE room_type SET CHANNEX_ROOM_TYPE_ID = ? WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [channexRoomTypeId, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // AMENITY CRUD OPERATIONS
  // ========================================
  
  // Get amenity by ID
  static async getAmenityById(id) {
    try {
      const query = 'SELECT IDNo, NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY FROM amenity WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [id]);
      return result[0];
    } catch (error) {
      throw error;
    }
  }

  // Create amenity
  static async createAmenity(NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, encodedBy) {
    try {
      const query = `
        INSERT INTO amenity (NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, ENCODED_BY, ENCODED_DT, ACTIVE) 
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, encodedBy]);
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  // Update amenity
  static async updateAmenity(IDNo, NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, editedBy) {
    try {
      const query = `
        UPDATE amenity 
        SET NAME = ?, DESCRIPTION = ?, IS_PAID = ?, COST = ?, AVAILABILITY = ?, EDITED_BY = ?, EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, editedBy, IDNo]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Delete amenity (soft delete)
  static async deleteAmenity(id, editedBy) {
    try {
      const query = 'UPDATE amenity SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1';
      const result = await queryDatabasePromise(query, [editedBy, id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // DROPDOWN DATA
  // ========================================
  
  // Get room types for dropdown
  static async getRoomTypes() {
    try {
      const query = 'SELECT IDNo, NAME, DESCRIPTION, BASE_PRICE FROM room_type WHERE ACTIVE = 1 ORDER BY NAME ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Get amenities for dropdown
  static async getAmenities() {
    try {
      const query = 'SELECT IDNo, NAME, DESCRIPTION, IS_PAID, COST FROM amenity WHERE ACTIVE = 1 ORDER BY NAME ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Get all amenities for dropdown
  static async getAllAmenities() {
    try {
      const query = 'SELECT IDNo, NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY FROM amenity WHERE ACTIVE = 1 ORDER BY NAME ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // SEASON CRUD OPERATIONS
  // ========================================
  
  // Get all seasons
  static async getAllSeasons() {
    try {
      const query = `
        SELECT 
          IDNo,
          NAME,
          START_DATE,
          END_DATE,
          ACTIVE
        FROM 
          season 
        WHERE 
          ACTIVE IN (0, 1)
        ORDER BY 
          START_DATE DESC`;
      
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Get season by ID
  static async getSeasonById(id) {
    try {
      const query = `
        SELECT 
          IDNo,
          NAME,
          DATE_FORMAT(START_DATE, '%Y-%m-%d') as START_DATE,
          DATE_FORMAT(END_DATE, '%Y-%m-%d') as END_DATE,
          ACTIVE
        FROM 
          season 
        WHERE 
          IDNo = ? AND ACTIVE IN (0, 1)`;
      
      const result = await queryDatabasePromise(query, [id]);
      return result[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Create season
  static async createSeason(NAME, START_DATE, END_DATE, ACTIVE, encodedBy) {
    try {
      const query = `
        INSERT INTO season 
        (NAME, START_DATE, END_DATE, ACTIVE, ENCODED_BY, ENCODED_DT) 
        VALUES (?, ?, ?, ?, ?, NOW())`;

      const result = await queryDatabasePromise(query, [
        NAME, 
        START_DATE, 
        END_DATE, 
        ACTIVE,
        encodedBy
      ]);

      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  // Update season
  static async updateSeason(IDNo, NAME, START_DATE, END_DATE, ACTIVE, encodedBy) {
    try {
      const query = `
        UPDATE season 
        SET 
          NAME = ?,
          START_DATE = ?,
          END_DATE = ?,
          ACTIVE = ?,
          ENCODED_BY = ?,
          ENCODED_DT = NOW()
        WHERE 
          IDNo = ?`;

      const result = await queryDatabasePromise(query, [
        NAME, 
        START_DATE, 
        END_DATE, 
        ACTIVE, 
        encodedBy,
        IDNo
      ]);

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Get seasons for dropdown
  static async getSeasons() {
    try {
      const query = 'SELECT IDNo, NAME FROM season WHERE ACTIVE = 1 ORDER BY IDNo ASC';
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // ROOM CONTROL METHODS
  // ========================================

  // Get room by room number
  static async getRoomByNumber(roomNumber) {
    try {
      const query = `
        SELECT 
          r.IDNo,
          r.ROOM_TYPE_ID,
          rt.NAME AS ROOM_TYPE_NAME,
          r.ROOM_NUMBER,
          r.ROOM_STATUS,
          r.ROOM_MAINTENANCE_STATUS,
          NULL AS ROOM_PRICE,
          r.ROOM_MAX,
          r.ROOM_BED,
          r.ROOM_SIZE,
          r.ROOM_VIEW,
          r.ROOM_DESCRIPTION,
          r.ROOM_IMAGE,
          r.ENCODED_BY,
          r.ENCODED_DT,
          r.EDITED_BY,
          r.EDITED_DT,
          r.ACTIVE
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ROOM_NUMBER = ? AND r.ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [roomNumber]);
      return result[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Get current booking by room number
  static async getCurrentBookingByRoom(roomNumber) {
    try {
      const query = `
        SELECT 
          b.IDNo AS BookingID,
          c.NAME AS CUSTOMER_NAME,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          b.ROOM_ID,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS
        FROM booking b
        INNER JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        WHERE r.ROOM_NUMBER = ? 
          AND b.BOOKING_STATUS IN ('Confirmed', 'Check-In', 'Extended')
          AND b.CHECK_IN_DATE <= CURDATE()
          AND b.CHECK_OUT_DATE >= CURDATE()
          AND b.ACTIVE = 1
        ORDER BY b.CHECK_IN_DATE DESC
        LIMIT 1
      `;
      const result = await queryDatabasePromise(query, [roomNumber]);
      return result[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Update room control settings
  static async updateRoomControlSettings(roomNumber, settings) {
    try {
      // For now, just log the settings to console since room_control table doesn't exist yet
      console.log(`📝 Room Control Update for Room ${roomNumber}:`, settings);
      
      // TODO: Create room_control table and implement proper database storage
      // For now, return success to allow the app to work
      return true;
    } catch (error) {
      console.error('Error updating room control settings:', error);
      // Return false to indicate failure
      return false;
    }
  }

  // Get room control history
  static async getRoomControlHistory(roomNumber, limit = 50) {
    try {
      // TODO: Create room_control_history table and implement proper database storage
      // For now, return empty array to allow the app to work
      console.log(`📝 Room Control History requested for Room ${roomNumber}, limit: ${limit}`);
      return [];
    } catch (error) {
      console.error('Error fetching room control history:', error);
      return [];
    }
  }

  // Emergency room control
  static async emergencyRoomControl(roomNumber, action, reason) {
    try {
      // TODO: Create room_control_emergency table and implement proper database storage
      // For now, just log the emergency action to console
      console.log(`🚨 EMERGENCY ROOM CONTROL for Room ${roomNumber}:`, { action, reason, timestamp: new Date().toISOString() });

      // Return success to allow the app to work
      return true;
    } catch (error) {
      console.error('Error in emergency room control:', error);
      return false;
    }
  }

  // Season match for a given date, using the same MM-DD (year-agnostic, wrap-around)
  // comparison as the Add Booking modal's client-side getSeasonIdForDate, so a "Peak"
  // season spanning Nov 13 - Mar 8 still matches correctly across the year boundary.
  static _findSeasonIdForDate(date, seasons) {
    const mmdd = String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    for (const season of seasons) {
      const start = new Date(season.START_DATE);
      const end = new Date(season.END_DATE);
      const startMMDD = String(start.getMonth() + 1).padStart(2, '0') + String(start.getDate()).padStart(2, '0');
      const endMMDD = String(end.getMonth() + 1).padStart(2, '0') + String(end.getDate()).padStart(2, '0');
      if (startMMDD <= endMMDD) {
        if (mmdd >= startMMDD && mmdd <= endMMDD) return season.IDNo;
      } else if (mmdd >= startMMDD || mmdd <= endMMDD) {
        return season.IDNo;
      }
    }
    return null;
  }

  // King (ROOM_BED=1) and Queen (ROOM_BED=2) nightly rate for a given date + booking
  // type, for the Room Checker's rate summary panel. room_season_price is technically
  // stored per-room, but every room sharing a bed count charges the same rate for a
  // given season/booking type (confirmed uniform across all 120 rooms per group), so
  // there's no single "the" room to key off of - MIN(PRICE) picks that one shared value.
  static async getSeasonalRateSummary(bookingType, date) {
    try {
      const seasons = await queryDatabasePromise('SELECT IDNo, START_DATE, END_DATE FROM season WHERE ACTIVE = 1');
      const seasonId = this._findSeasonIdForDate(date, seasons);
      if (!seasonId) {
        return { kingRate: 0, queenRate: 0, seasonId: null };
      }

      const rows = await queryDatabasePromise(
        `SELECT ROOM_BED, MIN(PRICE) AS PRICE
         FROM room_season_price
         WHERE ACTIVE = 1 AND BOOKING_TYPE = ? AND SEASON_ID = ? AND ROOM_BED IN (1, 2)
         GROUP BY ROOM_BED`,
        [bookingType, seasonId]
      );

      const kingRow = rows.find(r => Number(r.ROOM_BED) === 1);
      const queenRow = rows.find(r => Number(r.ROOM_BED) === 2);

      return {
        kingRate: kingRow ? parseFloat(kingRow.PRICE) : 0,
        queenRate: queenRow ? parseFloat(queenRow.PRICE) : 0,
        seasonId
      };
    } catch (error) {
      console.error('Error fetching seasonal rate summary:', error);
      return { kingRate: 0, queenRate: 0, seasonId: null };
    }
  }
}

module.exports = RoomModel; 