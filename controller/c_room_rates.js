const RoomRatesModel = require('../models/roomRatesModel');
const RoomModel = require('../models/roomModel');
const PoolVillaRatesModel = require('../models/poolVillaRatesModel');
const { SEASONS, MONTHS, CATEGORIES, DAY_RANGES, BREAKFAST_OPTIONS } = require('../config/roomRates');

const RoomRatesController = {
  // Settings -> Room Rates page
  renderPage: async (req, res) => {
    try {
      const roomTypes = await RoomModel.getRoomTypes(req.propertyId);
      res.render('room_rates/room_rates', {
        title: 'Room Rates',
        subTitle: 'Room Rates',
        activePage: 'room_rates',
        user: req.user || null,
        seasons: SEASONS,
        months: MONTHS,
        // Rate categories this property does not use (property.HIDDEN_RATE_OPTIONS) are not listed; every Long Term band
        // follows the single key 'long_term'.
        categories: CATEGORIES.filter((c) => {
          const key = String(c.key).startsWith('long_term') ? 'long_term' : c.key;
          return !(typeof res.locals.hideRate === 'function' && res.locals.hideRate(key));
        }).concat(await RoomRatesModel.listCustom(req.propertyId)),
        // the standard categories a new custom rate can start from (copy of their amounts)
        copyFromChoices: CATEGORIES.filter((c) => !String(c.key).startsWith('long_term')
          && !(typeof res.locals.hideRate === 'function' && res.locals.hideRate(c.key))),
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
  // poolVillaRates rides along too (cheap to always fetch) - the admin page
  // only renders it when the active property is actually Pool Villa.
  getData: async (req, res) => {
    try {
      const [rates, seasonMonths, poolVillaRates] = await Promise.all([
        RoomRatesModel.getAll(req.propertyId),
        RoomRatesModel.getSeasonMonthMap(req.propertyId),
        PoolVillaRatesModel.getAll()
      ]);
      res.json({ success: true, rates, seasonMonths, poolVillaRates });
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
      const seasonMonths = await RoomRatesModel.getSeasonMonthMap(req.propertyId);
      res.json({ success: true, seasonMonths });
    } catch (error) {
      console.error('Error fetching season months:', error);
      res.status(500).json({ success: false, message: 'Failed to load season months' });
    }
  },

  // Pool Villa's season x category x guest-count rate table - used by the
  // Add/Edit (Group) Booking modals to price Pool Villa stays, without
  // pulling Main Hotel's whole room_rates grid.
  getPoolVillaRates: async (req, res) => {
    try {
      const poolVillaRates = await PoolVillaRatesModel.getAll();
      res.json({ success: true, poolVillaRates });
    } catch (error) {
      console.error('Error fetching Pool Villa rates:', error);
      res.status(500).json({ success: false, message: 'Failed to load Pool Villa rates' });
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

  // Custom rate categories: POST { label, copyFrom? }, PUT /category/:id { label }, DELETE /category/:id
  createCategory: async (req, res) => {
    try {
      if (!req.propertyId) return res.status(400).json({ success: false, message: 'No property selected.' });
      const cat = await RoomRatesModel.createCustom(req.propertyId, req.body && req.body.label, req.user?.userId || null, req.body && req.body.copyFrom);
      res.json({ success: true, category: cat });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || 'Could not add the rate.' });
    }
  },
  renameCategory: async (req, res) => {
    try {
      const ok = await RoomRatesModel.renameCustom(req.propertyId, parseInt(req.params.id, 10), req.body && req.body.label);
      res.json({ success: ok, message: ok ? undefined : 'Rate not found.' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || 'Could not rename the rate.' });
    }
  },
  deleteCategory: async (req, res) => {
    try {
      const ok = await RoomRatesModel.removeCustom(req.propertyId, parseInt(req.params.id, 10));
      res.json({ success: ok, message: ok ? undefined : 'Rate not found.' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Could not delete the rate.' });
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
      const result = await RoomRatesModel.saveSeasonMonths(months, userId, req.propertyId);
      res.json({ success: true, updated: result.updated });
    } catch (error) {
      console.error('Error saving season months:', error);
      res.status(500).json({ success: false, message: 'Failed to save season months' });
    }
  },

  // Body: { rates: [{ season, category, guestCount, amount }, ...] }
  // An entry with amount null/blank removes that guest-count tier entirely
  // (see PoolVillaRatesModel.saveMany) rather than zeroing it.
  savePoolVillaRates: async (req, res) => {
    try {
      const rates = req.body && Array.isArray(req.body.rates) ? req.body.rates : [];
      if (!rates.length) {
        return res.status(400).json({ success: false, message: 'No rate changes to save.' });
      }
      const userId = req.user?.userId || null;
      const result = await PoolVillaRatesModel.saveMany(rates, userId);
      res.json({ success: true, updated: result.updated, deleted: result.deleted });
    } catch (error) {
      console.error('Error saving Pool Villa rates:', error);
      res.status(500).json({ success: false, message: 'Failed to save Pool Villa rates' });
    }
  }
};

module.exports = RoomRatesController;
