// ========================================
// SESSION TRACKING MODEL
// ========================================
// Tracks active user sessions for 1-to-1 login restriction
// Admin users (PERMISSIONS === 1) can have multiple sessions
// Non-admin users can only have one active session
// Uses database for persistent storage (survives server restarts)

const { queryDatabasePromise } = require('../config/database');
const crypto = require('crypto');

class SessionModel {
  
  // Generate hash from token for indexing
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  
  // Add a session token for a user
  static async addSession(userId, token) {
    try {
      // Calculate expiration time (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      // Generate token hash
      const tokenHash = this.hashToken(token);
      
      const query = `
        INSERT INTO user_sessions (user_id, token, token_hash, expires_at, active, created_at, last_activity)
        VALUES (?, ?, ?, ?, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          last_activity = NOW(),
          active = 1,
          expires_at = ?,
          token = ?
      `;
      
      await queryDatabasePromise(query, [userId, token, tokenHash, expiresAt, expiresAt, token]);
      
      return true;
    } catch (error) {
      console.error('Error adding session:', error);
      // If table doesn't exist yet, silently fail (will use polling detection)
      return false;
    }
  }

  // Remove a session token for a user
  static async removeSession(userId, token) {
    try {
      const tokenHash = this.hashToken(token);
      const query = `
        UPDATE user_sessions 
        SET active = 0, last_activity = NOW()
        WHERE user_id = ? AND token_hash = ? AND active = 1
      `;
      
      await queryDatabasePromise(query, [userId, tokenHash]);
      return true;
    } catch (error) {
      console.error('Error removing session:', error);
      return false;
    }
  }

  // Check if a token is valid (exists in active sessions)
  static async isTokenValid(userId, token) {
    try {
      const tokenHash = this.hashToken(token);
      const query = `
        SELECT id 
        FROM user_sessions 
        WHERE user_id = ? 
          AND token_hash = ? 
          AND active = 1 
          AND expires_at > NOW()
        LIMIT 1
      `;
      
      const results = await queryDatabasePromise(query, [userId, tokenHash]);
      return results && results.length > 0;
    } catch (error) {
      // If table doesn't exist, return true (allow access until table is created)
      if (error.code === 'ER_NO_SUCH_TABLE' || error.message.includes("doesn't exist")) {
        console.warn('user_sessions table does not exist - allowing access. Please run migration.');
        return true;
      }
      console.error('Error checking session validity:', error);
      // Fallback: return false if error (safer)
      return false;
    }
  }

  // Invalidate all sessions for a user (except current token if provided)
  static async invalidateAllSessions(userId, currentToken = null) {
    try {
      let query, params;
      
      if (currentToken) {
        // Invalidate all sessions except the current one
        const currentTokenHash = this.hashToken(currentToken);
        query = `
          UPDATE user_sessions 
          SET active = 0, last_activity = NOW()
          WHERE user_id = ? AND token_hash != ? AND active = 1
        `;
        params = [userId, currentTokenHash];
      } else {
        // Invalidate all sessions
        query = `
          UPDATE user_sessions 
          SET active = 0, last_activity = NOW()
          WHERE user_id = ? AND active = 1
        `;
        params = [userId];
      }
      
      const result = await queryDatabasePromise(query, params);
      return result;
    } catch (error) {
      // If table doesn't exist, silently fail (will rely on polling)
      if (error.code === 'ER_NO_SUCH_TABLE' || error.message.includes("doesn't exist")) {
        console.warn('user_sessions table does not exist - skipping session invalidation. Please run migration.');
        return false;
      }
      console.error('Error invalidating sessions:', error);
      return false;
    }
  }

  // Get all active tokens for a user
  static async getActiveTokens(userId) {
    try {
      const query = `
        SELECT token 
        FROM user_sessions 
        WHERE user_id = ? AND active = 1 AND expires_at > NOW()
      `;
      
      const results = await queryDatabasePromise(query, [userId]);
      return results ? results.map(r => r.token) : [];
    } catch (error) {
      console.error('Error getting active tokens:', error);
      return [];
    }
  }

  // Get count of active sessions for a user
  static async getSessionCount(userId) {
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM user_sessions 
        WHERE user_id = ? AND active = 1 AND expires_at > NOW()
      `;
      
      const results = await queryDatabasePromise(query, [userId]);
      return results && results.length > 0 ? results[0].count : 0;
    } catch (error) {
      console.error('Error getting session count:', error);
      return 0;
    }
  }

  // Clean up expired sessions (can be called periodically)
  static async cleanup() {
    try {
      const query = `
        UPDATE user_sessions 
        SET active = 0 
        WHERE expires_at < NOW() AND active = 1
      `;
      
      await queryDatabasePromise(query);
      return true;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return false;
    }
  }

  // Update socket ID for a session
  static async updateSocketId(userId, token, socketId) {
    try {
      const tokenHash = this.hashToken(token);
      const query = `
        UPDATE user_sessions 
        SET socket_id = ?, last_activity = NOW()
        WHERE user_id = ? AND token_hash = ? AND active = 1
      `;
      
      const result = await queryDatabasePromise(query, [socketId, userId, tokenHash]);
      
      // Check if any rows were affected
      if (result && result.affectedRows > 0) {
        console.log(`✅ Socket ID updated for user ${userId}: ${socketId} (affected rows: ${result.affectedRows})`);
        return true;
      } else {
        console.warn(`⚠️ No session found to update for user ${userId} with token_hash ${tokenHash.substring(0, 16)}... (active sessions only)`);
        
        // Try to update even if not active (might be a timing issue)
        const queryAny = `
          UPDATE user_sessions 
          SET socket_id = ?, last_activity = NOW()
          WHERE user_id = ? AND token_hash = ?
          ORDER BY created_at DESC
          LIMIT 1
        `;
        const resultAny = await queryDatabasePromise(queryAny, [socketId, userId, tokenHash]);
        if (resultAny && resultAny.affectedRows > 0) {
          console.log(`✅ Socket ID updated (found inactive session): ${socketId}`);
          return true;
        }
        
        return false;
      }
    } catch (error) {
      // Silently fail if table doesn't exist
      if (error.code === 'ER_NO_SUCH_TABLE' || error.message.includes("doesn't exist")) {
        console.warn('⚠️ user_sessions table does not exist');
        return false;
      }
      console.error('Error updating socket ID:', error);
      return false;
    }
  }

  // Get socket IDs for a user (for emitting Socket.IO events)
  static async getSocketIds(userId) {
    try {
      const query = `
        SELECT socket_id 
        FROM user_sessions 
        WHERE user_id = ? AND active = 1 AND expires_at > NOW() AND socket_id IS NOT NULL
      `;
      
      const results = await queryDatabasePromise(query, [userId]);
      return results ? results.map(r => r.socket_id).filter(id => id) : [];
    } catch (error) {
      console.error('Error getting socket IDs:', error);
      return [];
    }
  }
}

module.exports = SessionModel;

