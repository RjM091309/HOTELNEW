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
    const { modelName, vehicleType, color, plateNumber, fuelType, remarks, vehiclePhoto, encodedBy } = vehicleData;
    const dateNow = new Date();

    const query = `
      INSERT INTO vehicle (MODEL_NAME, VEHICLE_TYPE, COLOR, PLATE_NUMBER, FUEL_TYPE, REMARKS, VEHICLE_PHOTO, ENCODED_BY, ENCODED_DT, ACTIVE)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const values = [
      modelName,
      vehicleType,
      color,
      plateNumber,
      fuelType,
      remarks || '',
      vehiclePhoto || 'car-default.jpeg',
      encodedBy,
      dateNow
    ];

    const result = await queryDatabasePromise(query, values);
    return { id: result.insertId, ...vehicleData };
  }

  // Update vehicle
  static async updateVehicle(vehicleData) {
    const { vehicleId, modelName, vehicleType, color, plateNumber, fuelType, remarks, vehiclePhoto, editedBy } = vehicleData;
    const dateNow = new Date();

    let query;
    let values;

    if (vehiclePhoto) {
      query = `
        UPDATE vehicle
        SET MODEL_NAME = ?, VEHICLE_TYPE = ?, COLOR = ?, PLATE_NUMBER = ?, FUEL_TYPE = ?, REMARKS = ?, VEHICLE_PHOTO = ?, EDITED_BY = ?, EDITED_DT = ?
        WHERE IDNo = ?
      `;
      values = [modelName, vehicleType, color, plateNumber, fuelType, remarks || '', vehiclePhoto, editedBy, dateNow, vehicleId];
    } else {
      query = `
        UPDATE vehicle
        SET MODEL_NAME = ?, VEHICLE_TYPE = ?, COLOR = ?, PLATE_NUMBER = ?, FUEL_TYPE = ?, REMARKS = ?, EDITED_BY = ?, EDITED_DT = ?
        WHERE IDNo = ?
      `;
      values = [modelName, vehicleType, color, plateNumber, fuelType, remarks || '', editedBy, dateNow, vehicleId];
    }

    return await queryDatabasePromise(query, values);
  }

  // Delete vehicle (soft delete)
  static async deleteVehicle(id, editedBy) {
    const dateNow = new Date();
    const query = 'UPDATE vehicle SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?';
    return await queryDatabasePromise(query, [editedBy, dateNow, id]);
  }

}

module.exports = VehicleModel; 