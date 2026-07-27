const fs = require('fs').promises;
const path = require('path');
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
      const { start = 0, length = 10, search = { value: '' }, order = [{ column: 11, dir: 'desc' }], filter = 'all' } = req.query;
      const searchValue = search.value || '';
      const orderColumn = order[0]?.column || 11;
      const orderDir = order[0]?.dir || 'desc';

      const columns = [
        'BOOKING_ID', 'BOOKING_ID', 'GUEST_NAME', 'ROOM_NUMBER', 'CONFIRMATION_NUMBER',
        'TOTAL_AMOUNT', 'TOTAL_PAID', 'DISCOUNT_AMOUNT', 'BALANCE', 'PAYMENT_STATUS', 'PAYMENT_METHOD', 'LAST_PAYMENT_DATE', 'PROCESSED_BY_NAME'
      ];
      const orderBy = columns[orderColumn] || 'LAST_PAYMENT_DATE';

      let searchCondition = '';
      let searchParams = [];
      if (searchValue) {
        searchCondition = `AND (c.NAME LIKE ? OR r.ROOM_NUMBER LIKE ? OR b.CONFIRMATION_NUMBER LIKE ? OR bill.PAYMENT_STATUS LIKE ?)`;
        const p = `%${searchValue}%`;
        searchParams = [p, p, p, p];
      }

      // Date filter based on last payment date (matches PAYMENT DATE column in the table)
      let dateCondition = '';
      if (filter === 'today') {
        dateCondition = `AND DATE(lp.LAST_PAYMENT_DATE) = CURRENT_DATE()`;
      } else if (filter === 'last3days') {
        dateCondition = `
          AND DATE(lp.LAST_PAYMENT_DATE) >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
          AND DATE(lp.LAST_PAYMENT_DATE) <= CURRENT_DATE()
        `;
      } else if (filter === 'thisWeek') {
        // Week starts on Sunday (same logic as Weekly Sales summary cards)
        dateCondition = `
          AND DATE(lp.LAST_PAYMENT_DATE) >= DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY)
          AND DATE(lp.LAST_PAYMENT_DATE) <= CURRENT_DATE()
        `;
      } else if (filter === 'thisMonth') {
        dateCondition = `
          AND MONTH(lp.LAST_PAYMENT_DATE) = MONTH(CURRENT_DATE())
          AND YEAR(lp.LAST_PAYMENT_DATE) = YEAR(CURRENT_DATE())
        `;
      }

      if (dateCondition) {
        searchCondition += ` ${dateCondition}`;
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
      // Use local dates (hindi UTC) para tama ang Daily/Weekly/Monthly
      const todayDate = new Date();

      const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };

      const todayStr = formatDate(todayDate);

      const startOfWeek = new Date(todayDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const weekStartStr = formatDate(startOfWeek);

      const startOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      const monthStartStr = formatDate(startOfMonth);

      const { daily, weekly, monthly } = await paymentsModel.salesSummary(
        todayStr,
        weekStartStr,
        monthStartStr
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

  todayPaidPayments: async (req, res) => {
    try {
      const range = req.query.range === 'last7days' ? 'last7days' : 'today';
      const rows = await paymentsModel.getCollectedPayments(range);
      const total = rows.reduce((sum, row) => sum + Number(row.AMOUNT_PAID || 0), 0);
      res.json({ success: true, data: rows, total, range });
    } catch (err) {
      console.error('Error fetching today paid payments:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch today paid payments' });
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

  breakdownReceipt: async (req, res) => {
    try {
      const bookingId = req.params.bookingId;
      const result = await paymentsModel.bookingBreakdown(bookingId);
      if (!result) return res.status(404).send('Booking not found');

      let logoUrl = '';
      try {
        const logoPath = path.join(__dirname, '../public/img/Logo-Black.png');
        const logoBuf = await fs.readFile(logoPath);
        logoUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;
      } catch (_) {
        logoUrl = '';
      }

      const paymentIdsParam = req.query.paymentIds || '';
      const selectedPaymentIds = paymentIdsParam
        .split(',')
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0);

      let payments = result.payments || [];
      if (selectedPaymentIds.length > 0) {
        const selectedSet = new Set(selectedPaymentIds);
        payments = payments.filter((payment) => selectedSet.has(Number(payment.IDNo)));
      }

      res.render('payments/breakdown_receipt', {
        layout: false,
        embed: req.query.embed === '1',
        logoUrl,
        generatedAt: new Date(),
        bookingData: result.booking,
        services: result.services || [],
        extensions: result.extensions || [],
        payments
      });
    } catch (err) {
      console.error('Error rendering breakdown receipt:', err);
      res.status(500).send('Failed to load breakdown receipt');
    }
  },

  getPaymentsByBooking: async (req, res) => {
    try {
      const { bookingId } = req.params;
      const data = await paymentsModel.listPayments({ bookingId });
      res.json({ success: true, data });
    } catch (err) {
      console.error('Error getting payments by booking:', err);
      res.status(500).json({ success: false, message: 'Failed to get payments' });
    }
  },

  groupBreakdown: async (req, res) => {
    try {
      const bookingId = req.params.bookingId;
      const result = await paymentsModel.groupBookingBreakdown(bookingId);
      if (!result) {
        // Not a group booking, or booking not found - return 200 with flag
        return res.json({ success: false, isGroup: false, message: 'Not a group booking or booking not found' });
      }
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('Error fetching group breakdown:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch group breakdown' });
    }
  }
};

module.exports = paymentsController;


