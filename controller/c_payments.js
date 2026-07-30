const paymentsModel = require('../models/paymentsModel');
const {
  formatPaymentMethodLabel,
  getReceiptRenderContext
} = require('../helpers/receiptHelpers');

function buildReceiptDataFromPayments(booking, payments, processedBy) {
  const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.AMOUNT_PAID || 0), 0);
  const methods = [...new Set(payments.map((payment) => (payment.PAYMENT_METHOD || '').toLowerCase()).filter(Boolean))];
  const primaryMethod = methods.length === 1 ? methods[0] : (methods[0] || '');

  const purposeParts = [];
  const purposeLines = [];

  if (booking.CONFIRMATION_NUMBER) {
    const text = `Booking Confirmation: ${booking.CONFIRMATION_NUMBER}`;
    purposeParts.push(text);
    purposeLines.push({ type: 'info', text });
  }
  if (booking.ROOM_NUMBER) {
    const text = `Room: ${booking.ROOM_NUMBER}`;
    purposeParts.push(text);
    purposeLines.push({ type: 'info', text });
  }

  payments.forEach((payment) => {
    let date = '';
    let time = '';
    if (payment.PAYMENT_DATE) {
      const paymentDateObj = new Date(payment.PAYMENT_DATE);
      date = paymentDateObj.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
      });
      time = paymentDateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    const methodLabel = formatPaymentMethodLabel(payment.PAYMENT_METHOD);
    const amount = Number(payment.AMOUNT_PAID || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const paymentType = payment.PAYMENT_TYPE || 'Payment';
    const paymentDate = payment.PAYMENT_DATE
      ? new Date(payment.PAYMENT_DATE).toLocaleString('en-US')
      : '';
    purposeParts.push(`${paymentType} - ${methodLabel} - PHP ${amount}${paymentDate ? ` (${paymentDate})` : ''}`);
    purposeLines.push({
      type: 'payment',
      paymentType,
      method: methodLabel,
      amount,
      date,
      time
    });
  });

  const formattedTotal = totalAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  purposeParts.push(`Grand Total: PHP ${formattedTotal}`);
  purposeLines.push({ type: 'total', label: 'Grand Total', amount: formattedTotal });

  const receiptNo = payments.length === 1
    ? `RCP-${payments[0].IDNo}`
    : `RCP-${booking.BOOKING_ID}-${Date.now().toString().slice(-6)}`;

  return {
    isBlank: false,
    receiptNo,
    roomNo: booking.ROOM_NUMBER || '',
    receiptDate: payments[0]?.PAYMENT_DATE || new Date(),
    receivedFrom: booking.GUEST_NAME || '',
    amountPaid: totalAmount,
    paymentMethod: primaryMethod,
    paymentMethodLabel: methods.length > 1 ? methods.map(formatPaymentMethodLabel).join(', ') : formatPaymentMethodLabel(primaryMethod),
    purpose: purposeParts.join('\n'),
    purposeLines,
    receivedBy: processedBy || payments[0]?.NAME || ''
  };
}

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
        dailyUnpaid: (daily.bookingTotal || 0) - (daily.bookingPaid || 0),
        dailyBookingPaid: daily.bookingPaid || 0,
        dailyReceiptPaid: daily.receiptPaid || 0,
        weeklyTotal: weekly.weeklyTotal || 0,
        weeklyPaid: weekly.weeklyPaid || 0,
        weeklyUnpaid: (weekly.bookingTotal || 0) - (weekly.bookingPaid || 0),
        weeklyBookingPaid: weekly.bookingPaid || 0,
        weeklyReceiptPaid: weekly.receiptPaid || 0,
        monthlyTotal: monthly.monthlyTotal || 0,
        monthlyPaid: monthly.monthlyPaid || 0,
        monthlyUnpaid: (monthly.bookingTotal || 0) - (monthly.bookingPaid || 0),
        monthlyBookingPaid: monthly.bookingPaid || 0,
        monthlyReceiptPaid: monthly.receiptPaid || 0
      });
    } catch (err) {
      console.error('Error fetching sales summary:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch sales summary' });
    }
  },

  todayPaidPayments: async (req, res) => {
    try {
      const range = req.query.range === 'last7days' ? 'last7days' : 'today';
      const payments = await paymentsModel.getCollectedPayments(range);
      const receipts = await paymentsModel.getCollectedReceipts(range);

      const paymentsTotal = payments.reduce((sum, row) => sum + Number(row.AMOUNT_PAID || 0), 0);
      const receiptsTotal = receipts.reduce((sum, row) => sum + Number(row.AMOUNT_PAID || 0), 0);

      res.json({
        success: true,
        payments,
        receipts,
        paymentsTotal,
        receiptsTotal,
        total: paymentsTotal + receiptsTotal,
        range
      });
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

      if (!payments.length) {
        return res.status(400).send('No payments selected for receipt');
      }

      const receiptData = buildReceiptDataFromPayments(
        result.booking,
        payments,
        req.user?.FULLNAME || ''
      );

      const context = await getReceiptRenderContext(receiptData, req.query.embed);
      res.render('payments/payment_receipt', context);
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


