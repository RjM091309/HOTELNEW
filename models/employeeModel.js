// ========================================
// EMPLOYEE MODEL
// ========================================

const { queryDatabasePromise } = require('../config/database');

class EmployeeModel {
  
  // Get all active employees
  static async getAllEmployees() {
    const query = `
      SELECT 
        IDNo,
        PHOTO,
        FULLNAME,
        CONTACTNo,
        DEPARTMENT,
        ADDRESS,
        DATE_FORMAT(DATE_STARTED, '%Y-%m-%d') as DATE_STARTED,
        STATUS,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM employee 
      WHERE ACTIVE = 1 
      ORDER BY FULLNAME`;
    return await queryDatabasePromise(query);
  }

  // Get employee by ID
  static async getEmployeeById(id) {
    const query = `
      SELECT 
        IDNo,
        PHOTO,
        FULLNAME,
        CONTACTNo,
        DEPARTMENT,
        ADDRESS,
        DATE_FORMAT(DATE_STARTED, '%Y-%m-%d') as DATE_STARTED,
        STATUS,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM employee 
      WHERE IDNo = ? AND ACTIVE = 1`;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  // Create new employee
  static async createEmployee(employeeData) {
    const query = `
      INSERT INTO employee (
        FULLNAME, CONTACTNo, ADDRESS, DATE_STARTED, DEPARTMENT,
        PHOTO, ACTIVE, ENCODED_BY, ENCODED_DT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      employeeData.FULLNAME,
      employeeData.CONTACTNO,
      employeeData.ADDRESS,
      employeeData.DATE_STARTED,
      employeeData.DEPARTMENT,
      employeeData.PHOTO,
      employeeData.ACTIVE,
      employeeData.ENCODED_BY,
      employeeData.ENCODED_DT
    ];

    const result = await queryDatabasePromise(query, values);
    return { id: result.insertId, ...employeeData };
  }

  // Update employee
  static async updateEmployee(employeeData) {
    const query = `
      UPDATE employee
      SET FULLNAME = ?, DEPARTMENT = ?, CONTACTNo = ?, ADDRESS = ?,
          DATE_STARTED = ?, PHOTO = ?, EDITED_BY = ?, EDITED_DT = ?
      WHERE IDNo = ?
    `;
    
    const values = [
      employeeData.FULLNAME,
      employeeData.DEPARTMENT,
      employeeData.CONTACTNO,
      employeeData.ADDRESS,
      employeeData.DATE_STARTED,
      employeeData.PHOTO,
      employeeData.EDITED_BY,
      employeeData.EDITED_DT,
      employeeData.IDNo
    ];

    return await queryDatabasePromise(query, values);
  }

  // Delete employee (soft delete)
  static async deleteEmployee(id, editedBy) {
    const query = 'UPDATE employee SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ?';
    return await queryDatabasePromise(query, [editedBy, id]);
  }

}

module.exports = EmployeeModel; 