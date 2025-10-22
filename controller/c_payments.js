const paymentsModel = require('../models/paymentsModel');

const paymentsController = {
  renderPaymentsPage: async (req, res) => {
    try {
      const user = req.user || null;
      res.render('payments/payments', {
        title: 'Payment Management',
        subTitle: 'Payments',
        activePage: 'payments',
        user
      });
    } catch (err) {
      console.error('Error rendering payments page:', err);
      res.status(500).render('error/500', { message: 'Failed to load payments page' });
    }
  },

  list: async (req, res) => {
    try {
      const { bookingId, type, method, from, to, limit } = req.query;
      const data = await paymentsModel.listPayments({ bookingId, type, method, from, to }, limit);
      res.json({ success: true, data });
    } catch (err) {
      console.error('Error listing payments:', err);
      res.status(500).json({ success: false, message: 'Failed to list payments' });
    }
  },

  tableData: async (req, res) => {
    try {
      const { start = 0, length = 10, search = { value: '' }, order = [{ column: 10, dir: 'desc' }], filter = 'today' } = req.query;
      const searchValue = search.value || '';
      const orderColumn = order[0]?.column || 10;
      const orderDir = order[0]?.dir || 'desc';

      const columns = [
        'BOOKING_ID', 'BOOKING_ID', 'GUEST_NAME', 'ROOM_NUMBER', 'CONFIRMATION_NUMBER',
        'TOTAL_AMOUNT', 'TOTAL_PAID', 'BALANCE', 'PAYMENT_STATUS', 'PAYMENT_METHOD', 'BOOKING_DATE'
      ];
      const orderBy = columns[orderColumn] || 'BOOKING_DATE';

      let searchCondition = '';
      let searchParams = [];
      if (searchValue) {
        searchCondition = `AND (c.NAME LIKE ? OR r.ROOM_NUMBER LIKE ? OR b.CONFIRMATION_NUMBER LIKE ? OR bill.PAYMENT_STATUS LIKE ?)`;
        const p = `%${searchValue}%`;
        searchParams = [p, p, p, p];
      }

      // Date filter based on booking.ENCODED_DT
      const now = new Date();
      let fromDate = null;
      if (filter === 'today') {
        fromDate = new Date();
      } else if (filter === 'last3days') {
        fromDate = new Date();
        fromDate.setDate(now.getDate() - 2);
      } else if (filter === 'thisWeek') {
        fromDate = new Date();
        fromDate.setDate(now.getDate() - now.getDay());
      } else if (filter === 'thisMonth') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      if (fromDate) {
        const y = fromDate.getFullYear();
        const m = String(fromDate.getMonth() + 1).padStart(2, '0');
        const d = String(fromDate.getDate()).padStart(2, '0');
        const fromStr = `${y}-${m}-${d}`;
        searchCondition += ` AND DATE(b.ENCODED_DT) >= ?`;
        searchParams.push(fromStr);
      }

      const totalRecords = await paymentsModel.countDatatable(searchCondition, searchParams);
      const rows = await paymentsModel.fetchDatatable(searchCondition, searchParams, orderBy, orderDir, length, start);

      res.json({
        draw: parseInt(req.query.draw) || 1,
        recordsTotal: totalRecords,
        recordsFiltered: totalRecords,
        data: rows
      });
    } catch (err) {
      console.error('Error fetching payments data:', err);
      res.status(500).json({ draw: parseInt(req.query.draw) || 1, recordsTotal: 0, recordsFiltered: 0, data: [], error: 'Failed to fetch payments data' });
    }
  },

  salesSummary: async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const startOfMonth = new Date();
      startOfMonth.setDate(1);

      const { daily, weekly, monthly } = await paymentsModel.salesSummary(
        today,
        startOfWeek.toISOString().split('T')[0],
        startOfMonth.toISOString().split('T')[0]
      );

      res.json({
        success: true,
        dailyTotal: daily.dailyTotal || 0,
        dailyPaid: daily.dailyPaid || 0,
        dailyUnpaid: (daily.dailyTotal || 0) - (daily.dailyPaid || 0),
        weeklyTotal: weekly.weeklyTotal || 0,
        weeklyPaid: weekly.weeklyPaid || 0,
        weeklyUnpaid: (weekly.weeklyTotal || 0) - (weekly.weeklyPaid || 0),
        monthlyTotal: monthly.monthlyTotal || 0,
        monthlyPaid: monthly.monthlyPaid || 0,
        monthlyUnpaid: (monthly.monthlyTotal || 0) - (monthly.monthlyPaid || 0)
      });
    } catch (err) {
      console.error('Error fetching sales summary:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch sales summary' });
    }
  },

  breakdown: async (req, res) => {
    try {
      const bookingId = req.params.bookingId;
      const result = await paymentsModel.bookingBreakdown(bookingId);
      if (!result) return res.status(404).json({ success: false, message: 'Booking not found' });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('Error fetching breakdown:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch breakdown' });
    }
  },

  getPaymentsByBooking: async (req, res) => {
    try {
      const { bookingId } = req.params;
      const data = await paymentsModel.listPayments({ bookingId });
      res.json(data);
    } catch (err) {
      console.error('Error getting payments by booking:', err);
      res.status(500).json({ success: false, message: 'Failed to get payments' });
    }
  }
};

module.exports = paymentsController;


