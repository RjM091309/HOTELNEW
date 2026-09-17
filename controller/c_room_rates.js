const RoomRatesModel = require('../models/roomRatesModel');
const RoomModel = require('../models/roomModel');
const { SEASONS, MONTHS, CATEGORIES, DAY_RANGES, BREAKFAST_OPTIONS } = require('../config/roomRates');

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
        seasons: SEASONS,
        months: MONTHS,
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

  // Current amounts as a nested map: rates[season][category][dayRange][roomTypeId][breakfast],
  // plus the month->season assignment so the admin page can load both in one round trip.
  getData: async (req, res) => {
    try {
      const [rates, seasonMonths] = await Promise.all([
        RoomRatesModel.getAll(),
        RoomRatesModel.getSeasonMonthMap()
      ]);
      res.json({ success: true, rates, seasonMonths });
    } catch (error) {
      console.error('Error fetching room rates:', error);
      res.status(500).json({ success: false, message: 'Failed to load room rates' });
    }
  },

  // Just the month->season map - used by booking pages/modals (single & group
  // booking, Room Checker) to resolve which season a check-in date falls
  // under, without pulling the whole rates grid.
  getSeasonMonths: async (req, res) => {
    try {
      const seasonMonths = await RoomRatesModel.getSeasonMonthMap();
      res.json({ success: true, seasonMonths });
    } catch (error) {
      console.error('Error fetching season months:', error);
      res.status(500).json({ success: false, message: 'Failed to load season months' });
    }
  },

  // Body: { updates: [{ season, category, dayRange, roomTypeId, breakfast, amount }, ...] }
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
  },

  // Body: { months: [{ month, season }, ...] }
  saveSeasonMonths: async (req, res) => {
    try {
      const months = req.body && Array.isArray(req.body.months) ? req.body.months : [];
      if (!months.length) {
        return res.status(400).json({ success: false, message: 'No month assignment to save.' });
      }
      const userId = req.user?.userId || null;
      const result = await RoomRatesModel.saveSeasonMonths(months, userId);
      res.json({ success: true, updated: result.updated });
    } catch (error) {
      console.error('Error saving season months:', error);
      res.status(500).json({ success: false, message: 'Failed to save season months' });
    }
  }
};

module.exports = RoomRatesController;
