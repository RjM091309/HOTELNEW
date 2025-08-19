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
          r.ROOM_PRICE,
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
          r.ROOM_PRICE,
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
        
        // Get seasonal pricing for this room
        const seasonalPricingQuery = `
          SELECT rsp.SEASON_ID, s.NAME AS SEASON_NAME, rsp.BOOKING_TYPE, rsp.ROOM_BED, rsp.PRICE
          FROM room_season_price rsp
          JOIN season s ON rsp.SEASON_ID = s.IDNo
          WHERE rsp.ROOM_ID = ? AND rsp.ACTIVE = 1
          ORDER BY s.NAME ASC, rsp.BOOKING_TYPE ASC, rsp.ROOM_BED ASC
        `;
        const seasonalPricing = await queryDatabasePromise(seasonalPricingQuery, [room.IDNo]);
        room.SEASONAL_PRICES = seasonalPricing;
        
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

  // Create new room
  static async createRoom(ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS, 
                         ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
                         ROOM_DESCRIPTION, ROOM_IMAGE = null, AMENITIES = [], SEASONAL_PRICING = [], encodedBy) {
    try {
      const query = `
        INSERT INTO room (
          ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
          ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
          ROOM_DESCRIPTION, ROOM_IMAGE, ENCODED_BY, ENCODED_DT, ACTIVE
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [
        ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
        ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
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
      
      // Add seasonal pricing if provided
      if (SEASONAL_PRICING && SEASONAL_PRICING.length > 0) {
        for (const pricing of SEASONAL_PRICING) {
          await queryDatabasePromise(
            'INSERT INTO room_season_price (ROOM_ID, SEASON_ID, BOOKING_TYPE, ROOM_BED, PRICE, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)',
            [roomId, pricing.season_id, pricing.booking_type, pricing.room_bed, pricing.season_price, encodedBy]
          );
        }
      }
      
      return roomId;
    } catch (error) {
      throw error;
    }
  }

  // Update room
  static async updateRoom(IDNo, ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS, 
                         ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
                         ROOM_DESCRIPTION, ROOM_IMAGE = null, AMENITIES = [], SEASONAL_PRICING = [], editedBy) {
    try {
      // Build update query dynamically based on whether image is provided
      let query = `
        UPDATE room SET 
          ROOM_TYPE_ID = ?, ROOM_NUMBER = ?, ROOM_STATUS = ?,
          ROOM_PRICE = ?, ROOM_MAX = ?, ROOM_BED = ?, ROOM_SIZE = ?, ROOM_VIEW = ?, 
          ROOM_DESCRIPTION = ?, EDITED_BY = ?, EDITED_DT = NOW()
      `;
      
      let params = [
        ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
        ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
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
      
      // Update seasonal pricing
      // First, deactivate all existing seasonal pricing
      await queryDatabasePromise(
        'UPDATE room_season_price SET ACTIVE = 0, ENCODED_BY = ?, ENCODED_DT = NOW() WHERE ROOM_ID = ?',
        [editedBy, IDNo]
      );
      
      // Then add new seasonal pricing if provided
      if (SEASONAL_PRICING && SEASONAL_PRICING.length > 0) {
        for (const pricing of SEASONAL_PRICING) {
          await queryDatabasePromise(
            'INSERT INTO room_season_price (ROOM_ID, SEASON_ID, BOOKING_TYPE, ROOM_BED, PRICE, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)',
            [IDNo, pricing.season_id, pricing.booking_type, pricing.room_bed, pricing.season_price, editedBy]
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

  // Create room type
  static async createRoomType(NAME, DESCRIPTION, BASE_PRICE, encodedBy) {
    try {
      const query = `
        INSERT INTO room_type (NAME, DESCRIPTION, BASE_PRICE, ENCODED_BY, ENCODED_DT, ACTIVE) 
        VALUES (?, ?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [NAME, DESCRIPTION, BASE_PRICE, encodedBy]);
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  // Update room type
  static async updateRoomType(IDNo, NAME, DESCRIPTION, BASE_PRICE, editedBy) {
    try {
      const query = `
        UPDATE room_type 
        SET NAME = ?, DESCRIPTION = ?, BASE_PRICE = ?, EDITED_BY = ?, EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [NAME, DESCRIPTION, BASE_PRICE, editedBy, IDNo]);
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
}

module.exports = RoomModel; 