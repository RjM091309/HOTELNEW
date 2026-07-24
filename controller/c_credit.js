const creditModel = require('../models/creditModel');

const creditController = {
  renderCreditPage: async (req, res) => {
    try {
      const user = req.user || null;
      res.render('credit/credit', {
        title: 'Credit Ledger',
        subTitle: 'Credit',
        activePage: 'credit',
        user
      });
    } catch (err) {
      console.error('Error rendering credit page:', err);
      res.status(500).render('error/500', { message: 'Failed to load credit page' });
    }
  },

  tableData: async (req, res) => {
    try {
      const { start = 0, length = 10, search = { value: '' }, order = [{ column: 1, dir: 'desc' }] } = req.query;
      const searchValue = search.value || '';
      const orderColumn = order[0]?.column ?? 1;
      const orderDir = order[0]?.dir || 'desc';

      // Mirrors the column order in views/credit/credit.ejs (index 7 is the non-orderable ACTION column)
      const columns = ['GROUP_KEY', 'FIRST_PAYMENT_DATE', 'GUEST_NAME', 'ROOM_NUMBER', 'CONFIRMATION_NUMBER', 'AMOUNT_PAID', 'UNSETTLED_COUNT'];
      const orderBy = columns[orderColumn] || 'FIRST_PAYMENT_DATE';

      let searchCondition = '';
      let searchParams = [];
      if (searchValue) {
        searchCondition = `AND (c.NAME LIKE ? OR r.ROOM_NUMBER LIKE ? OR b.CONFIRMATION_NUMBER LIKE ? OR p.REMARKS LIKE ?)`;
        const p = `%${searchValue}%`;
        searchParams = [p, p, p, p];
      }

      const totalRecords = await creditModel.countDatatable(searchCondition, searchParams);
      const rows = await creditModel.fetchDatatable(searchCondition, searchParams, orderBy, orderDir, length, start);
      const totalOutstandingCredit = await creditModel.totalOutstandingCredit();

      res.json({
        draw: parseInt(req.query.draw) || 1,
        recordsTotal: totalRecords,
        recordsFiltered: totalRecords,
        data: rows,
        totalOutstandingCredit
      });
    } catch (err) {
      console.error('Error fetching credit data:', err);
      res.status(500).json({ draw: parseInt(req.query.draw) || 1, recordsTotal: 0, recordsFiltered: 0, data: [], error: 'Failed to fetch credit data' });
    }
  },

  breakdown: async (req, res) => {
    try {
      const { bookingId, date } = req.query;
      if (!bookingId || !date) {
        return res.status(400).json({ success: false, message: 'Missing bookingId or date.' });
      }
      const rows = await creditModel.fetchBreakdown(bookingId, date);
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Error fetching credit breakdown:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch credit breakdown.' });
    }
  },

  settle: async (req, res) => {
    try {
      const paymentId = req.params.paymentId;
      const settledBy = req.user.userId;

      const settled = await creditModel.markSettled(paymentId, settledBy);
      if (!settled) {
        return res.status(400).json({ success: false, message: 'This credit entry was not found or is already settled.' });
      }

      res.json({ success: true, message: 'Credit marked as paid.' });
    } catch (err) {
      console.error('Error settling credit:', err);
      res.status(500).json({ success: false, message: 'Failed to settle credit.' });
    }
  },

  settleGroup: async (req, res) => {
    try {
      const { bookingId, date } = req.body;
      const settledBy = req.user.userId;
      if (!bookingId || !date) {
        return res.status(400).json({ success: false, message: 'Missing bookingId or date.' });
      }

      const count = await creditModel.markSettledGroup(bookingId, date, settledBy);
      if (count === 0) {
        return res.status(400).json({ success: false, message: 'No outstanding credit entries found for this group.' });
      }

      res.json({ success: true, message: `${count} credit entr${count === 1 ? 'y' : 'ies'} marked as paid.`, count });
    } catch (err) {
      console.error('Error settling credit group:', err);
      res.status(500).json({ success: false, message: 'Failed to settle credit group.' });
    }
  },

  settleSelected: async (req, res) => {
    try {
      const { paymentIds } = req.body;
      const settledBy = req.user.userId;
      if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No credit entries selected.' });
      }

      const count = await creditModel.markSettledMany(paymentIds, settledBy);
      if (count === 0) {
        return res.status(400).json({ success: false, message: 'The selected credit entries were not found or are already settled.' });
      }

      res.json({ success: true, message: `${count} credit entr${count === 1 ? 'y' : 'ies'} marked as paid.`, count });
    } catch (err) {
      console.error('Error settling selected credit entries:', err);
      res.status(500).json({ success: false, message: 'Failed to settle selected credit entries.' });
    }
  }
};

module.exports = creditController;
