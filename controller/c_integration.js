const IntegrationModel = require('../models/integrationModel');

class IntegrationController {
    
    static async getIntegrationPage(req, res) {
        res.render('integration/integration', {
            title: 'Integration Management',
            subTitle: 'Integration',
            activePage: 'integration',
            user: req.user
        });
    }
    
    static async getAllIntegrationRooms(req, res) {
        try {
            const rooms = await IntegrationModel.getAllIntegrationRooms();
            res.json({ success: true, data: rooms });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch rooms' });
        }
    }
    
    static async getIntegrationRoomById(req, res) {
        try {
            const room = await IntegrationModel.getIntegrationRoomById(req.params.id);
            if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
            res.json({ success: true, data: room });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch room' });
        }
    }
    
    static async updateIntegrationRoom(req, res) {
        try {
            const { IDNo, CLEAN_UP_DEVICE_ID, DND_DEVICE_ID } = req.body;
            if (!IDNo) return res.status(400).json({ success: false, message: 'Room ID required' });
            
            const updated = await IntegrationModel.updateIntegrationRoom(
                IDNo, CLEAN_UP_DEVICE_ID, DND_DEVICE_ID, req.user?.userId
            );
            
            if (!updated) return res.status(404).json({ success: false, message: 'Room not found' });
            res.json({ success: true, message: 'Updated successfully' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Update failed' });
        }
    }
}

module.exports = IntegrationController; 