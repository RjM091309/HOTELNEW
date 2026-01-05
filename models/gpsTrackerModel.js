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
      battery,
      satelliteCount,
      gsmSignal
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
        satellite_count,
        gsm_signal,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
      deviceId,
      parseFloat(latitude),
      parseFloat(longitude),
      speed ? parseFloat(speed) : null,
      heading ? parseFloat(heading) : null,
      timestamp ? new Date(timestamp) : new Date(),
      battery ? parseFloat(battery) : null,
      satelliteCount ? parseInt(satelliteCount) : null,
      gsmSignal ? parseInt(gsmSignal) : null
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
        satellite_count,
        gsm_signal,
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

  // Get all devices that have ever sent location data with latest location details
  static async getAllDevices() {
    const query = `
      SELECT 
        gl.device_id,
        gl.latitude,
        gl.longitude,
        gl.speed,
        gl.heading,
        gl.timestamp as last_update,
        gl.battery,
        gl.satellite_count,
        gl.created_at as last_created,
        (SELECT COUNT(*) FROM gps_locations WHERE device_id = gl.device_id) as total_updates
      FROM gps_locations gl
      INNER JOIN (
        SELECT device_id, MAX(created_at) as max_created_at, MAX(timestamp) as max_timestamp
        FROM gps_locations
        GROUP BY device_id
      ) latest ON gl.device_id = latest.device_id 
        AND gl.created_at = latest.max_created_at
        AND gl.timestamp = latest.max_timestamp
      ORDER BY gl.timestamp DESC
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

  // Update timestamp field of the latest location (for heartbeat/keepalive - shows device is still sending data)
  // Note: created_at is NOT updated - it represents "last time actual movement was saved"
  // timestamp is updated to show "last time data was received" for online status check
  static async updateLocationHeartbeat(deviceId, newTimestamp) {
    // Get the latest location ID first
    const latestLocation = await this.getLatestLocation(deviceId);
    if (!latestLocation || !latestLocation.id) {
      return false;
    }
    
    // Update timestamp field (GPS device timestamp) to show device is still sending data
    // But keep created_at unchanged (represents last actual movement)
    const query = `
      UPDATE gps_locations 
      SET timestamp = ?
      WHERE id = ?
    `;
    const result = await queryDatabasePromise(query, [newTimestamp, latestLocation.id]);
    return result.affectedRows > 0;
  }

  // Update battery, satellite count, and GSM signal without changing location (for stationary devices)
  // This allows updating device status even when location hasn't changed
  static async updateDeviceStatus(deviceId, battery, satelliteCount, gsmSignal, newTimestamp) {
    // Get the latest location ID first
    const latestLocation = await this.getLatestLocation(deviceId);
    if (!latestLocation || !latestLocation.id) {
      return false;
    }
    
    // Build update query with only fields that have values
    const updates = [];
    const values = [];
    
    if (newTimestamp) {
      updates.push('timestamp = ?');
      values.push(newTimestamp);
    }
    
    if (battery !== null && battery !== undefined) {
      updates.push('battery = ?');
      values.push(parseFloat(battery));
    }
    
    if (satelliteCount !== null && satelliteCount !== undefined && satelliteCount !== '') {
      updates.push('satellite_count = ?');
      values.push(parseInt(satelliteCount));
    }
    
    if (gsmSignal !== null && gsmSignal !== undefined) {
      updates.push('gsm_signal = ?');
      values.push(parseInt(gsmSignal));
    }
    
    if (updates.length === 0) {
      return false; // Nothing to update
    }
    
    values.push(latestLocation.id);
    
    const query = `
      UPDATE gps_locations 
      SET ${updates.join(', ')}
      WHERE id = ?
    `;
    
    const result = await queryDatabasePromise(query, values);
    if (result.affectedRows > 0) {
      console.log(`✅ Updated device status for location ID ${latestLocation.id}: ${updates.join(', ')}`);
    }
    return result.affectedRows > 0;
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

