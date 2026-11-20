const RoomRequestModel = require('../models/roomRequestModel');
const { logActivity } = require('../utils/activityLogger');
const staffAppRealtime = require('../services/staffAppRealtime');

const who = (req) => ({
  userId: (req.user && (req.user.userId || req.user.IDNo)) || null,
  userName: (req.user && (req.user.FULLNAME || req.user.USERNAME)) || null
});

// every open dashboard / calendar draws the rooms again (full.ejs and the calendar listen to 'dashboard-updated')
function tellScreens(req, data) {
  try {
    const io = req.app.get('io');
    if (io) io.emit('dashboard-updated', { source: 'housekeeping', propertyId: req.propertyId, ...data });
  } catch (e) { /* the 30 s refresh still runs */ }
  // and the Housekeeping phone apps of this property (room board + requests)
  staffAppRealtime.changed(req.propertyId);
  staffAppRealtime.tasks(req.propertyId);
}

class RoomRequestController {
  // GET /room-requests - the open requests of the active property (waiting and in progress); ?done=1 adds what was done today
  static async list(req, res) {
    try {
      const requests = await RoomRequestModel.listPending(req.propertyId);
      const out = { success: true, requests, me: who(req).userId };
      if (req.query && req.query.done) out.done = await RoomRequestModel.listDoneToday(req.propertyId);
      res.json(out);
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
      if (!result.duplicate) tellScreens(req, { action: 'room-request', roomNumber: result.roomNumber });
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error creating room request:', error);
      res.status(500).json({ success: false, message: 'Could not save the request.' });
    }
  }

  // POST /room-requests/:id/done | /cancel | /accept | /release
  static async change(kind, req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Unknown request.' });
      const args = { propertyId: req.propertyId, id, ...who(req) };
      let ok;
      if (kind === 'accept') ok = await RoomRequestModel.accept(args);
      else if (kind === 'release') ok = await RoomRequestModel.release(args);
      else ok = await RoomRequestModel.close({ ...args, status: kind === 'done' ? 'done' : 'cancelled' });
      if (!ok) {
        const msg = kind === 'accept' ? 'Someone already took that request.' : kind === 'release' ? 'That request is not in progress.' : 'That request is already closed.';
        return res.status(409).json({ success: false, message: msg });
      }
      tellScreens(req, { action: 'room-request-' + kind, id });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating room request:', error);
      res.status(500).json({ success: false, message: 'Could not update the request.' });
    }
  }
  static done(req, res) { return RoomRequestController.change('done', req, res); }
  static cancel(req, res) { return RoomRequestController.change('cancel', req, res); }
  static accept(req, res) { return RoomRequestController.change('accept', req, res); }
  static release(req, res) { return RoomRequestController.change('release', req, res); }

  // POST /room-requests/rooms/:roomNumber/status { status: 'clean' | 'dirty' }
  static async roomStatus(req, res) {
    try {
      const roomNumber = String(req.params.roomNumber || '').trim();
      const status = String((req.body && req.body.status) || '').toLowerCase();
      if (!roomNumber) return res.status(400).json({ success: false, message: 'Pick a room.' });
      if (status !== 'clean' && status !== 'dirty') return res.status(400).json({ success: false, message: 'Say clean or dirty.' });
      const result = await RoomRequestModel.setClean({ propertyId: req.propertyId, roomNumber, clean: status === 'clean', ...who(req) });
      if (result.error) return res.status(result.code || 400).json({ success: false, message: result.error });
      if (result.status !== result.oldStatus) {
        logActivity(req, {
          module: 'housekeeping', action: 'ROOM_STATUS_UPDATE', entityType: 'room', entityId: result.roomId, propertyId: req.propertyId,
          description: `Housekeeping: room ${result.roomNumber} marked ${status === 'clean' ? 'clean (available)' : 'dirty (to be cleaned)'}`,
          oldData: { status: result.oldStatus }, newData: { status: result.status }
        });
      }
      tellScreens(req, { action: 'room-status-updated', roomNumber: result.roomNumber, status: result.status });
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error marking the room:', error);
      res.status(500).json({ success: false, message: 'Could not update the room.' });
    }
  }

  // GET /room-requests/charge-items - the minibar / laundry price list (Services of the category "Minibar" or "Laundry")
  static async chargeItems(req, res) {
    try {
      res.json({ success: true, items: await RoomRequestModel.chargeItems() });
    } catch (error) {
      console.error('Error loading the charge items:', error);
      res.status(500).json({ success: false, message: 'Could not load the price list.' });
    }
  }

  // POST /room-requests/rooms/:roomNumber/charges { category, items: [{ id, count }] } or { category, description, amount }
  static async charge(req, res) {
    try {
      const roomNumber = String(req.params.roomNumber || '').trim();
      const b = req.body || {};
      const result = await RoomRequestModel.addCharge({
        propertyId: req.propertyId, roomNumber, category: String(b.category || ''), items: b.items, description: b.description, amount: b.amount, userId: who(req).userId
      });
      if (result.error) return res.status(result.code || 400).json({ success: false, message: result.error });
      logActivity(req, {
        module: 'housekeeping', action: 'SERVICE_ADD', bookingId: result.bookingId, entityType: 'booking', entityId: result.bookingId, propertyId: req.propertyId,
        amount: result.total, description: `Housekeeping: ${String(b.category).toLowerCase()} for room ${roomNumber} - ${result.lines.join(', ')}`
      });
      tellScreens(req, { action: 'room-charge', roomNumber, bookingId: result.bookingId });
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error adding the room charge:', error);
      res.status(500).json({ success: false, message: 'Could not add it to the bill.' });
    }
  }
}

module.exports = RoomRequestController;
