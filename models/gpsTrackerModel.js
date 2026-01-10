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
      isCharging,
      satelliteCount,
      gsmSignal,
      isMoving
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
        is_charging,
        satellite_count,
        gsm_signal,
        is_moving,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    // Validate and clamp battery value to 0-100 range
    let batteryValue = null;
    if (battery !== null && battery !== undefined) {
      const parsedBattery = parseFloat(battery);
      if (!isNaN(parsedBattery)) {
        batteryValue = Math.min(100, Math.max(0, parsedBattery));
      }
    }
    
    // Handle satelliteCount "N/A" values - convert to null
    let satelliteCountValue = null;
    if (satelliteCount !== null && satelliteCount !== undefined) {
      const satCountStr = String(satelliteCount).trim().toUpperCase();
      if (satCountStr !== 'N/A' && satCountStr !== 'NA' && satCountStr !== '') {
        const satCountNum = parseInt(satelliteCount);
        satelliteCountValue = isNaN(satCountNum) ? null : satCountNum;
      }
    }
    
    const values = [
      deviceId,
      parseFloat(latitude),
      parseFloat(longitude),
      speed ? parseFloat(speed) : null,
      heading ? parseFloat(heading) : null,
      timestamp ? new Date(timestamp) : new Date(),
      batteryValue,
      isCharging === undefined || isCharging === null ? null : !!isCharging,
      satelliteCountValue,
      gsmSignal ? parseInt(gsmSignal) : null,
      isMoving !== undefined && isMoving !== null ? (!!isMoving ? 1 : 0) : 0
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
        is_charging,
        satellite_count,
        gsm_signal,
        is_moving,
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
        is_charging,
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
        gl.is_charging,
        gl.satellite_count,
        gl.gsm_signal,
        gl.is_moving,
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
        is_charging,
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

  // Update battery, satellite count, GSM signal, location coordinates, and is_moving status (for stationary devices or minor movements)
  // This allows updating device status and position even when location hasn't changed significantly
  static async updateDeviceStatus(deviceId, battery, satelliteCount, gsmSignal, newTimestamp, isCharging, latitude = null, longitude = null, isMoving = null) {
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
    
    // Always update coordinates if provided (ensures marker shows latest position even if no new row created)
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      updates.push('latitude = ?');
      updates.push('longitude = ?');
      values.push(parseFloat(latitude));
      values.push(parseFloat(longitude));
    }
    
    if (battery !== null && battery !== undefined) {
      const parsedBattery = parseFloat(battery);
      if (!isNaN(parsedBattery)) {
        updates.push('battery = ?');
        // Clamp battery to 0-100 range
        values.push(Math.min(100, Math.max(0, parsedBattery)));
      }
    }

    if (isCharging !== null && isCharging !== undefined) {
      updates.push('is_charging = ?');
      values.push(!!isCharging);
    }
    
    // Handle satelliteCount - allow 0 as valid value, but convert "N/A" to null
    // Check if satelliteCount is explicitly set (including 0 which is valid)
    if (satelliteCount !== null && satelliteCount !== undefined && satelliteCount !== '') {
      const satCountStr = String(satelliteCount).trim().toUpperCase();
      if (satCountStr !== 'N/A' && satCountStr !== 'NA') {
        const satCountNum = parseInt(satelliteCount);
        if (!isNaN(satCountNum)) {
          updates.push('satellite_count = ?');
          values.push(satCountNum);
        }
      }
    }
    // Note: If satelliteCount is 0 (number), it will be handled by the above condition
    // because 0 !== null && 0 !== undefined && 0 !== '' is all true
    
    if (gsmSignal !== null && gsmSignal !== undefined) {
      updates.push('gsm_signal = ?');
      values.push(parseInt(gsmSignal));
    }
    
    // Update is_moving status if provided (important for standby detection)
    if (isMoving !== null && isMoving !== undefined) {
      updates.push('is_moving = ?');
      values.push(!!isMoving ? 1 : 0);
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
      // Build readable log message with actual values
      const logParts = [];
      let valueIndex = 0;
      updates.forEach(update => {
        const field = update.split(' = ')[0];
        const value = values[valueIndex];
        if (field === 'timestamp') {
          logParts.push(`${field}=${value ? new Date(value).toISOString() : 'null'}`);
        } else if (field === 'latitude' || field === 'longitude') {
          logParts.push(`${field}=${value !== null && value !== undefined ? value.toFixed(6) : 'null'}`);
        } else if (field === 'is_charging') {
          logParts.push(`${field}=${value ? 'true' : 'false'}`);
        } else {
          logParts.push(`${field}=${value !== null && value !== undefined ? value : 'null'}`);
        }
        valueIndex++;
      });
      console.log(`✅ Updated device status for location ID ${latestLocation.id}: ${logParts.join(', ')}`);
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

