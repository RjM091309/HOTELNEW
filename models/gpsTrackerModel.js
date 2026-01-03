// ========================================
// GPS TRACKER MODEL
// ========================================

const { queryDatabasePromise } = require('../config/database');

class GpsTrackerModel {
  
  // Create new GPS location entry
  static async createLocation(locationData) {
    const { 
      deviceId, 
      latitude, 
      longitude, 
      speed, 
      heading, 
      timestamp, 
      battery 
    } = locationData;

    const query = `
      INSERT INTO gps_locations (
        device_id, 
        latitude, 
        longitude, 
        speed, 
        heading, 
        timestamp, 
        battery, 
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
      deviceId,
      parseFloat(latitude),
      parseFloat(longitude),
      speed ? parseFloat(speed) : null,
      heading ? parseFloat(heading) : null,
      timestamp ? new Date(timestamp) : new Date(),
      battery ? parseFloat(battery) : null
    ];

    const result = await queryDatabasePromise(query, values);
    return { id: result.insertId, ...locationData };
  }

  // Get latest location by device ID
  static async getLatestLocation(deviceId) {
    const query = `
      SELECT 
        id,
        device_id,
        latitude,
        longitude,
        speed,
        heading,
        timestamp,
        battery,
        created_at
      FROM gps_locations 
      WHERE device_id = ?
      ORDER BY timestamp DESC, created_at DESC
      LIMIT 1
    `;
    const results = await queryDatabasePromise(query, [deviceId]);
    return results[0] || null;
  }

  // Get location history by device ID
  static async getLocationHistory(deviceId, limit = 100) {
    const query = `
      SELECT 
        id,
        device_id,
        latitude,
        longitude,
        speed,
        heading,
        timestamp,
        battery,
        created_at
      FROM gps_locations 
      WHERE device_id = ?
      ORDER BY timestamp DESC, created_at DESC
      LIMIT ?
    `;
    return await queryDatabasePromise(query, [deviceId, limit]);
  }

  // Get all active devices (devices that sent data recently)
  static async getActiveDevices(hoursAgo = 24) {
    const query = `
      SELECT 
        device_id,
        MAX(timestamp) as last_update,
        MAX(created_at) as last_created,
        COUNT(*) as total_updates
      FROM gps_locations 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY device_id
      ORDER BY last_update DESC
    `;
    return await queryDatabasePromise(query, [hoursAgo]);
  }

  // Get all devices that have ever sent location data
  static async getAllDevices() {
    const query = `
      SELECT 
        device_id,
        MAX(timestamp) as last_update,
        MAX(created_at) as last_created,
        COUNT(*) as total_updates
      FROM gps_locations 
      GROUP BY device_id
      ORDER BY last_update DESC
    `;
    return await queryDatabasePromise(query);
  }

  // Get location by ID
  static async getLocationById(id) {
    const query = `
      SELECT 
        id,
        device_id,
        latitude,
        longitude,
        speed,
        heading,
        timestamp,
        battery,
        created_at
      FROM gps_locations 
      WHERE id = ?
    `;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  // Delete old locations (cleanup)
  static async deleteOldLocations(daysOld = 30) {
    const query = `
      DELETE FROM gps_locations 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    return await queryDatabasePromise(query, [daysOld]);
  }

}

module.exports = GpsTrackerModel;

