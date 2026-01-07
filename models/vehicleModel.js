// ========================================
// VEHICLE MODEL
// ========================================

const { queryDatabasePromise } = require('../config/database');

class VehicleModel {
  
  // Get all active vehicles
  static async getAllVehicles() {
    const query = `
      SELECT 
        IDNo,
        MODEL_NAME,
        VEHICLE_TYPE,
        COLOR,
        PLATE_NUMBER,
        FUEL_TYPE,
        REMARKS,
        GPS_DEVICE_ID,
        VEHICLE_PHOTO,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM vehicle 
      WHERE ACTIVE = 1
      ORDER BY MODEL_NAME`;
    return await queryDatabasePromise(query);
  }

  // Get vehicle by ID
  static async getVehicleById(id) {
    const query = `
      SELECT 
        IDNo,
        MODEL_NAME,
        VEHICLE_TYPE,
        COLOR,
        PLATE_NUMBER,
        FUEL_TYPE,
        REMARKS,
        GPS_DEVICE_ID,
        VEHICLE_PHOTO,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM vehicle 
      WHERE IDNo = ? AND ACTIVE = 1`;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  // Create new vehicle
  static async createVehicle(vehicleData) {
    const { modelName, vehicleType, color, plateNumber, fuelType, remarks, gpsDeviceId, vehiclePhoto, encodedBy } = vehicleData;
    const dateNow = new Date();

    const query = `
      INSERT INTO vehicle (MODEL_NAME, VEHICLE_TYPE, COLOR, PLATE_NUMBER, FUEL_TYPE, REMARKS, GPS_DEVICE_ID, VEHICLE_PHOTO, ENCODED_BY, ENCODED_DT, ACTIVE)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const values = [
      modelName,
      vehicleType,
      color,
      plateNumber,
      fuelType,
      remarks || '',
      gpsDeviceId || null,
      vehiclePhoto || 'car-default.jpeg',
      encodedBy,
      dateNow
    ];

    const result = await queryDatabasePromise(query, values);
    return { id: result.insertId, ...vehicleData };
  }

  // Update vehicle
  static async updateVehicle(vehicleData) {
    const { vehicleId, modelName, vehicleType, color, plateNumber, fuelType, remarks, gpsDeviceId, vehiclePhoto, editedBy } = vehicleData;
    const dateNow = new Date();

    let query;
    let values;

    if (vehiclePhoto) {
      query = `
        UPDATE vehicle
        SET MODEL_NAME = ?, VEHICLE_TYPE = ?, COLOR = ?, PLATE_NUMBER = ?, FUEL_TYPE = ?, REMARKS = ?, GPS_DEVICE_ID = ?, VEHICLE_PHOTO = ?, EDITED_BY = ?, EDITED_DT = ?
        WHERE IDNo = ?
      `;
      values = [modelName, vehicleType, color, plateNumber, fuelType, remarks || '', gpsDeviceId || null, vehiclePhoto, editedBy, dateNow, vehicleId];
    } else {
      query = `
        UPDATE vehicle
        SET MODEL_NAME = ?, VEHICLE_TYPE = ?, COLOR = ?, PLATE_NUMBER = ?, FUEL_TYPE = ?, REMARKS = ?, GPS_DEVICE_ID = ?, EDITED_BY = ?, EDITED_DT = ?
        WHERE IDNo = ?
      `;
      values = [modelName, vehicleType, color, plateNumber, fuelType, remarks || '', gpsDeviceId || null, editedBy, dateNow, vehicleId];
    }

    return await queryDatabasePromise(query, values);
  }

  // Get all vehicles with their latest GPS location
  static async getVehiclesWithLocation() {
    const query = `
      SELECT 
        v.IDNo,
        v.MODEL_NAME,
        v.VEHICLE_TYPE,
        v.COLOR,
        v.PLATE_NUMBER,
        v.FUEL_TYPE,
        v.REMARKS,
        v.GPS_DEVICE_ID,
        v.VEHICLE_PHOTO,
        v.ACTIVE,
        gl.latitude,
        gl.longitude,
        gl.speed,
        gl.heading,
        gl.timestamp as last_location_time,
        gl.battery,
        gl.is_charging,
        gl.satellite_count,
        gl.gsm_signal,
        gl.created_at as last_location_created,
        TIMESTAMPDIFF(MINUTE, gl.created_at, NOW()) as minutes_since_update
      FROM vehicle v
      LEFT JOIN (
        SELECT 
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
          created_at,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC, timestamp DESC) as rn
        FROM gps_locations
      ) gl ON v.GPS_DEVICE_ID COLLATE utf8mb4_unicode_ci = gl.device_id COLLATE utf8mb4_unicode_ci AND gl.rn = 1
      WHERE v.ACTIVE = 1
      ORDER BY v.MODEL_NAME`;
    return await queryDatabasePromise(query);
  }

  // Get vehicle with location by ID
  static async getVehicleWithLocationById(id) {
    const query = `
      SELECT 
        v.IDNo,
        v.MODEL_NAME,
        v.VEHICLE_TYPE,
        v.COLOR,
        v.PLATE_NUMBER,
        v.FUEL_TYPE,
        v.REMARKS,
        v.GPS_DEVICE_ID,
        v.VEHICLE_PHOTO,
        v.ACTIVE,
        gl.latitude,
        gl.longitude,
        gl.speed,
        gl.heading,
        gl.timestamp as last_location_time,
        gl.battery,
        gl.is_charging,
        gl.satellite_count,
        gl.gsm_signal,
        gl.created_at as last_location_created,
        TIMESTAMPDIFF(MINUTE, gl.created_at, NOW()) as minutes_since_update
      FROM vehicle v
      LEFT JOIN (
        SELECT 
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
          created_at,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC, timestamp DESC) as rn
        FROM gps_locations
      ) gl ON v.GPS_DEVICE_ID COLLATE utf8mb4_unicode_ci = gl.device_id COLLATE utf8mb4_unicode_ci AND gl.rn = 1
      WHERE v.IDNo = ? AND v.ACTIVE = 1`;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  // Delete vehicle (soft delete)
  static async deleteVehicle(id, editedBy) {
    const dateNow = new Date();
    const query = 'UPDATE vehicle SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?';
    return await queryDatabasePromise(query, [editedBy, dateNow, id]);
  }

}

module.exports = VehicleModel; 