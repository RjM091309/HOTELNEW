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
      const { start = 0, length = 10, search = { value: '' }, order = [{ column: 2, dir: 'desc' }] } = req.query;
      const searchValue = search.value || '';
      const orderColumn = order[0]?.column ?? 2;
      const orderDir = order[0]?.dir || 'desc';

      // Mirrors the column order in views/credit/credit.ejs (index 1 is the non-orderable # column, index 10 is the non-orderable ACTION column)
      const columns = ['PAYMENT_ID', 'PAYMENT_ID', 'PAYMENT_DATE', 'GUEST_NAME', 'ROOM_NUMBER', 'CONFIRMATION_NUMBER', 'AMOUNT_PAID', 'REMARKS', 'PROCESSED_BY_NAME', 'SETTLED_DATE'];
      const orderBy = columns[orderColumn] || 'PAYMENT_DATE';

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
  }
};

module.exports = creditController;
