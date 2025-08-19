// ========================================
// SERVICES MODEL
// ========================================

const { queryDatabasePromise } = require('../config/database');

class ServicesModel {
  
  // Get all active services
  static async getAllServices() {
    const query = `
      SELECT 
        IDNo,
        SERVICE_CATEGORY,
        SERVICE_NAME,
        SERVICE_DESCRIPTION,
        SERVICE_COST,
        SERVICE_AVAILABILITY,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM services 
      WHERE ACTIVE = 1 
      ORDER BY SERVICE_NAME`;
    return await queryDatabasePromise(query);
  }

  // Get service by ID
  static async getServiceById(id) {
    const query = `
      SELECT 
        IDNo,
        SERVICE_CATEGORY,
        SERVICE_NAME,
        SERVICE_DESCRIPTION,
        SERVICE_COST,
        SERVICE_AVAILABILITY,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM services 
      WHERE IDNo = ? AND ACTIVE = 1`;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  // Create new service
  static async createService(serviceData) {
    const query = `
      INSERT INTO services (
        SERVICE_CATEGORY, SERVICE_NAME, SERVICE_DESCRIPTION, SERVICE_COST, 
        SERVICE_AVAILABILITY, ENCODED_BY, ENCODED_DT, ACTIVE
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      serviceData.SERVICE_CATEGORY,
      serviceData.SERVICE_NAME,
      serviceData.SERVICE_DESCRIPTION,
      serviceData.SERVICE_COST,
      serviceData.SERVICE_AVAILABILITY,
      serviceData.ENCODED_BY,
      serviceData.ENCODED_DT,
      serviceData.ACTIVE
    ];

    const result = await queryDatabasePromise(query, values);
    return { id: result.insertId, ...serviceData };
  }

  // Update service
  static async updateService(serviceData) {
    const query = `
      UPDATE services
      SET SERVICE_CATEGORY = ?, SERVICE_NAME = ?, SERVICE_DESCRIPTION = ?, 
          SERVICE_COST = ?, SERVICE_AVAILABILITY = ?, EDITED_BY = ?, EDITED_DT = ?
      WHERE IDNo = ?
    `;
    
    const values = [
      serviceData.SERVICE_CATEGORY,
      serviceData.SERVICE_NAME,
      serviceData.SERVICE_DESCRIPTION,
      serviceData.SERVICE_COST,
      serviceData.SERVICE_AVAILABILITY,
      serviceData.EDITED_BY,
      serviceData.EDITED_DT,
      serviceData.IDNo
    ];

    return await queryDatabasePromise(query, values);
  }

  // Delete service (soft delete)
  static async deleteService(id, editedBy) {
    const query = 'UPDATE services SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ?';
    return await queryDatabasePromise(query, [editedBy, id]);
  }

}

module.exports = ServicesModel; 