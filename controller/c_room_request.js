const RoomRequestModel = require('../models/roomRequestModel');

const who = (req) => ({
  userId: (req.user && (req.user.userId || req.user.IDNo)) || null,
  userName: (req.user && (req.user.FULLNAME || req.user.USERNAME)) || null
});

class RoomRequestController {
  // GET /room-requests - the pending requests of the active property
  static async list(req, res) {
    try {
      const requests = await RoomRequestModel.listPending(req.propertyId);
      res.json({ success: true, requests });
    } catch (error) {
      console.error('Error listing room requests:', error);
      res.status(500).json({ success: false, message: 'Could not load the requests.' });
    }
  }

  // POST /room-requests { roomNumber, type: 'MUR' | 'CUSTOM', text }
  static async create(req, res) {
    try {
      const roomNumber = String((req.body && req.body.roomNumber) || '').trim();
      const type = String((req.body && req.body.type) || '').toUpperCase();
      const text = String((req.body && req.body.text) || '').trim().slice(0, 300);
      if (!roomNumber) return res.status(400).json({ success: false, message: 'Pick a room.' });
      if (type !== 'MUR' && type !== 'CUSTOM') return res.status(400).json({ success: false, message: 'Pick MUR or Custom request.' });
      if (type === 'CUSTOM' && !text) return res.status(400).json({ success: false, message: 'Write what the room needs.' });
      const result = await RoomRequestModel.create({ propertyId: req.propertyId, roomNumber, type, text, ...who(req) });
      if (result.error) return res.status(404).json({ success: false, message: result.error });
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error creating room request:', error);
      res.status(500).json({ success: false, message: 'Could not save the request.' });
    }
  }

  // POST /room-requests/:id/done  and  /room-requests/:id/cancel
  static async close(status, req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Unknown request.' });
      const ok = await RoomRequestModel.close({ propertyId: req.propertyId, id, status, ...who(req) });
      if (!ok) return res.status(404).json({ success: false, message: 'That request is already closed.' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error closing room request:', error);
      res.status(500).json({ success: false, message: 'Could not update the request.' });
    }
  }
  static done(req, res) { return RoomRequestController.close('done', req, res); }
  static cancel(req, res) { return RoomRequestController.close('cancelled', req, res); }
}

module.exports = RoomRequestController;
