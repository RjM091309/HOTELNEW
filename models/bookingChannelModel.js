// ========================================
// BOOKING CHANNEL MODEL
// ========================================

const { queryDatabasePromise } = require('../config/database');

class BookingChannelModel {
  
  // ========================================
  // CRUD OPERATIONS
  // ========================================
  
  // Get all booking channels
  static async getAllBookingChannels() {
    const query = `
      SELECT 
        id,
        name,
        img,
        api_key,
        status,
        created_at,
        updated_at
      FROM booking_channels 
      ORDER BY name`;
    return await queryDatabasePromise(query);
  }

  // Get booking channel by ID
  static async getBookingChannelById(id) {
    const query = `
      SELECT 
        id,
        name,
        img,
        api_key,
        status,
        created_at,
        updated_at
      FROM booking_channels 
      WHERE id = ?`;
    const results = await queryDatabasePromise(query, [id]);
    return results.length > 0 ? results[0] : null;
  }

  // Create new booking channel
  static async createBookingChannel(channelData) {
    const query = `
      INSERT INTO booking_channels (name, img, api_key, status) 
      VALUES (?, ?, ?, ?)`;
    
    const values = [
      channelData.name,
      channelData.img,
      channelData.api_key,
      channelData.status
    ];

    return await queryDatabasePromise(query, values);
  }

  // Update booking channel
  static async updateBookingChannel(channelData) {
    const query = `
      UPDATE booking_channels
      SET name = ?, img = ?, api_key = ?, status = ?
      WHERE id = ?
    `;
    
    const values = [
      channelData.name,
      channelData.img,
      channelData.api_key,
      channelData.status,
      channelData.id
    ];

    return await queryDatabasePromise(query, values);
  }

  // Toggle booking channel status
  static async toggleChannelStatus(id) {
    try {
      // First get current status
      const channel = await this.getBookingChannelById(id);
      
      if (!channel) {
        return null;
      }

      // Toggle status
      const newStatus = channel.status === 'Active' ? 'Inactive' : 'Active';
      
      // Update status
      const query = 'UPDATE booking_channels SET status = ? WHERE id = ?';
      await queryDatabasePromise(query, [newStatus, id]);
      
      // Return updated channel data
      return {
        ...channel,
        status: newStatus
      };
    } catch (error) {
      console.error('Error toggling channel status:', error);
      throw error;
    }
  }
}

module.exports = BookingChannelModel;
