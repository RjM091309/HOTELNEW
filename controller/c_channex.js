const ChannexService = require('../services/channexService');
const RoomModel = require('../models/roomModel');

function getChannexService() {
    const apiKey = process.env.CHANNEX_API_KEY;
    if (!apiKey) {
        return null;
    }
    return new ChannexService(apiKey, process.env.CHANNEX_API_BASE_URL);
}

const ChannexController = {
    getSettingsPage(req, res) {
        res.render('channex/settings', {
            title: 'Channex Settings',
            subTitle: 'Channel Manager Connection',
            activePage: 'channex_settings',
            user: req.user
        });
    },

    async testConnection(req, res) {
        const channexService = getChannexService();
        if (!channexService) {
            return res.status(400).json({ success: false, message: 'CHANNEX_API_KEY is not configured' });
        }

        const result = await channexService.testConnection();

        if (result.success) {
            return res.json({ success: true, message: 'Connected to Channex', properties: result.data });
        }

        return res.status(502).json({ success: false, message: result.message });
    },

    // Push local room types to Channex as room_types, using the count of active,
    // non-maintenance rooms per type as count_of_rooms. Creates on first sync,
    // updates on subsequent syncs using the saved CHANNEX_ROOM_TYPE_ID link.
    async syncRoomTypes(req, res) {
        const channexService = getChannexService();
        if (!channexService) {
            return res.status(400).json({ success: false, message: 'CHANNEX_API_KEY is not configured' });
        }

        const propertiesResult = await channexService.listProperties();
        if (!propertiesResult.success) {
            return res.status(502).json({ success: false, message: propertiesResult.message });
        }
        const property = propertiesResult.data[0];
        if (!property) {
            return res.status(502).json({ success: false, message: 'No property found on Channex for this API key' });
        }

        const roomTypes = await RoomModel.getRoomTypesForChannexSync();
        const results = [];

        for (const roomType of roomTypes) {
            const attrs = {
                title: roomType.NAME,
                count_of_rooms: roomType.AVAILABLE_ROOM_COUNT
            };

            let result;
            if (roomType.CHANNEX_ROOM_TYPE_ID) {
                result = await channexService.updateRoomType(roomType.CHANNEX_ROOM_TYPE_ID, attrs);
            } else {
                result = await channexService.createRoomType(property.id, attrs);
                if (result.success) {
                    await RoomModel.setChannexRoomTypeId(roomType.IDNo, result.data.id);
                }
            }

            results.push({
                id: roomType.IDNo,
                name: roomType.NAME,
                available_room_count: roomType.AVAILABLE_ROOM_COUNT,
                action: roomType.CHANNEX_ROOM_TYPE_ID ? 'updated' : 'created',
                success: result.success,
                message: result.success ? null : result.message
            });
        }

        const failed = results.filter(r => !r.success);
        return res.json({
            success: failed.length === 0,
            property: { id: property.id, title: property.attributes.title },
            results
        });
    }
};

module.exports = ChannexController;
