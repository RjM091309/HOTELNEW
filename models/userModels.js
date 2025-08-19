// ========================================
// USER INFO MODEL
// ========================================

const { queryDatabasePromise } = require('../config/database');
const bcrypt = require('bcryptjs');

class UserModel {
  
  // Get all active users
  static async getAllUsers() {
    const query = `
      SELECT 
        IDno,
        FULLNAME, 
        USERNAME, 
        PERMISSIONS,
        ENCODED_BY,
        ENCODED_DT,
        ACTIVE
      FROM user_info 
      WHERE ACTIVE = 1
      ORDER BY FULLNAME`;
    return await queryDatabasePromise(query);
  }

  // Get user by ID
  static async getUserById(id) {
    const query = `
      SELECT 
        IDno,
        FULLNAME, 
        USERNAME, 
        PERMISSIONS,
        ENCODED_BY,
        ENCODED_DT,
        ACTIVE
      FROM user_info 
      WHERE IDno = ? AND ACTIVE = 1`;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  // Create new user
  static async createUser(userData) {
    const { fullname, username, password, role, encodedBy } = userData;
    const dateNow = new Date();

    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO user_info (FULLNAME, USERNAME, PASSWORD, PERMISSIONS, ENCODED_BY, ENCODED_DT, ACTIVE)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `;

    const values = [
      fullname, 
      username, 
      hashedPassword, 
      role, 
      encodedBy, 
      dateNow
    ];

    const result = await queryDatabasePromise(query, values);
    return { id: result.insertId, ...userData };
  }

  // Update user
  static async updateUser(userData) {
    const { userId, fullname, username, password, role, editedBy } = userData;
    const dateNow = new Date();

    let query;
    let values;

    if (password) {
      // Hash the password if provided
      const hashedPassword = await bcrypt.hash(password, 10);
      query = `
        UPDATE user_info
        SET FULLNAME = ?, USERNAME = ?, PASSWORD = ?, PERMISSIONS = ?
        WHERE IDno = ?
      `;
      values = [fullname, username, hashedPassword, role, userId];
    } else {
      query = `
        UPDATE user_info
        SET FULLNAME = ?, USERNAME = ?, PERMISSIONS = ?
        WHERE IDno = ?
      `;
      values = [fullname, username, role, userId];
    }

    return await queryDatabasePromise(query, values);
  }

  // Delete user (soft delete)
  static async deleteUser(id, editedBy) {
    const query = 'UPDATE user_info SET ACTIVE = 0 WHERE IDno = ?';
    return await queryDatabasePromise(query, [id]);
  }

  // Check username availability
  static async checkUsernameAvailability(username) {
    const query = 'SELECT COUNT(*) AS count FROM user_info WHERE USERNAME = ?';
    const result = await queryDatabasePromise(query, [username]);
    return result[0].count === 0; // Return true if username is available (count = 0)
  }

}

module.exports = UserModel;
