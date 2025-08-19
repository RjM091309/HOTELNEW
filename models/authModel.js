const { queryDatabasePromise } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthModel {
  // Get user by username for authentication
  static async getUserByUsername(username) {
    try {
      const query = `
        SELECT 
          IDNo,
          FULLNAME,
          USERNAME,
          PASSWORD,
          PERMISSIONS,
          ACTIVE
        FROM user_info 
        WHERE USERNAME = ? AND ACTIVE = 1
      `;
      
      const users = await queryDatabasePromise(query, [username]);
      return users[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Get user by ID for token refresh
  static async getUserById(userId) {
    try {
      const query = `
        SELECT 
          IDNo,
          FULLNAME,
          USERNAME,
          PASSWORD,
          PERMISSIONS,
          ACTIVE
        FROM user_info 
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const users = await queryDatabasePromise(query, [userId]);
      return users[0] || null;
    } catch (error) {
      throw error;
    }
  }

  // Verify password
  static async verifyPassword(password, hashedPassword) {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      throw error;
    }
  }

  // Generate JWT token
  static generateToken(user) {
    return jwt.sign(
      {
        userId: user.IDNo,
        FULLNAME: user.FULLNAME,
        USERNAME: user.USERNAME,
        PERMISSIONS: user.PERMISSIONS || []
      },
      process.env.JWT_SECRET || 'your-jwt-secret',
      { expiresIn: '24h' }
    );
  }

  // Verify JWT token
  static verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    } catch (error) {
      return null;
    }
  }

  // Check if user exists and is active
  static async checkUserExists(username) {
    try {
      const query = `
        SELECT COUNT(*) AS count 
        FROM user_info 
        WHERE USERNAME = ? AND ACTIVE = 1
      `;
      
      const result = await queryDatabasePromise(query, [username]);
      return result[0].count > 0;
    } catch (error) {
      throw error;
    }
  }

  // Get user permissions
  static async getUserPermissions(userId) {
    try {
      const query = `
        SELECT PERMISSIONS 
        FROM user_info 
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const users = await queryDatabasePromise(query, [userId]);
      return users[0]?.PERMISSIONS || [];
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AuthModel; 