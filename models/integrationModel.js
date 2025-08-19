const { queryDatabasePromise } = require('../config/database');

class IntegrationModel {
    
    static async getAllIntegrationRooms() {
        const query = `SELECT IDNo, ROOM_NUMBER, CLEAN_UP_DEVICE_ID, DND_DEVICE_ID FROM room WHERE ACTIVE = 1 ORDER BY ROOM_NUMBER ASC`;
        return await queryDatabasePromise(query);
    }
    
    static async getIntegrationRoomById(id) {
        const query = `SELECT IDNo, ROOM_NUMBER, CLEAN_UP_DEVICE_ID, DND_DEVICE_ID FROM room WHERE IDNo = ? AND ACTIVE = 1`;
        const rooms = await queryDatabasePromise(query, [id]);
        return rooms.length > 0 ? rooms[0] : null;
    }
    
    static async updateIntegrationRoom(id, cleanUpDeviceId, dndDeviceId, editedBy) {
        const query = `UPDATE room SET CLEAN_UP_DEVICE_ID = ?, DND_DEVICE_ID = ?, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1`;
        const result = await queryDatabasePromise(query, [cleanUpDeviceId || null, dndDeviceId || null, editedBy, id]);
        return result.affectedRows > 0;
    }
}

module.exports = IntegrationModel; 