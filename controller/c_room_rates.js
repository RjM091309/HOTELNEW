const RoomRatesModel = require('../models/roomRatesModel');
const RoomModel = require('../models/roomModel');
const { CATEGORIES, DAY_RANGES, BREAKFAST_OPTIONS } = require('../config/roomRates');

const RoomRatesController = {
  // Settings -> Room Rates page
  renderPage: async (req, res) => {
    try {
      const roomTypes = await RoomModel.getRoomTypes();
      res.render('room_rates/room_rates', {
        title: 'Room Rates',
        subTitle: 'Room Rates',
        activePage: 'room_rates',
        user: req.user || null,
        categories: CATEGORIES,
        dayRanges: DAY_RANGES,
        roomTypes: (roomTypes || []).map((t) => ({ id: t.IDNo, name: t.NAME })),
        breakfastOptions: BREAKFAST_OPTIONS
      });
    } catch (error) {
      console.error('Error rendering room rates page:', error);
      res.status(500).render('error/500', { title: 'Server Error', subTitle: '500 Error' });
    }
  },

  // Current amounts as a nested map: rates[category][dayRange][roomTypeId][breakfast]
  getData: async (req, res) => {
    try {
      const rates = await RoomRatesModel.getAll();
      res.json({ success: true, rates });
    } catch (error) {
      console.error('Error fetching room rates:', error);
      res.status(500).json({ success: false, message: 'Failed to load room rates' });
    }
  },

  // Body: { updates: [{ category, dayRange, roomTypeId, breakfast, amount }, ...] }
  saveRates: async (req, res) => {
    try {
      const updates = req.body && Array.isArray(req.body.updates) ? req.body.updates : [];
      if (!updates.length) {
        return res.status(400).json({ success: false, message: 'No changes to save.' });
      }
      const userId = req.user?.userId || null;
      const result = await RoomRatesModel.updateMany(updates, userId);
      res.json({ success: true, updated: result.updated });
    } catch (error) {
      console.error('Error saving room rates:', error);
      res.status(500).json({ success: false, message: 'Failed to save room rates' });
    }
  }
};

module.exports = RoomRatesController;
