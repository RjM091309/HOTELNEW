const ejs = require('ejs');
const path = require('path');
const PaymentReceiptModel = require('../models/paymentReceiptModel');
const ReceiptSettingsModel = require('../models/receiptSettingsModel');
const {
  formatPaymentMethodLabel,
  mapReceiptRecordToViewData,
  mapBlankReceiptViewData,
  getReceiptRenderContext
} = require('../helpers/receiptHelpers');

function normalizePaymentMethod(method) {
  const key = (method || 'cash').toLowerCase();
  const allowed = ['cash', 'bank_transfer', 'check', 'other'];
  return allowed.includes(key) ? key : 'other';
}

function parseReceiptPayload(body) {
  const paymentMethod = normalizePaymentMethod(body.paymentMethod);
  const paymentMethodOther = paymentMethod === 'other'
    ? String(body.paymentMethodOther || '').trim()
    : null;

  return {
    ROOM_NO: String(body.roomNo || '').trim(),
    RECEIPT_DATE: body.receiptDate ? new Date(body.receiptDate) : new Date(),
    RECEIVED_FROM: String(body.receivedFrom || '').trim(),
    AMOUNT_PAID: Number(body.amountPaid || 0),
    PAYMENT_METHOD: paymentMethod,
    PAYMENT_METHOD_OTHER: paymentMethodOther,
    PURPOSE: String(body.purpose || '').trim(),
    RECEIVED_BY: String(body.receivedBy || '').trim()
  };
}

function extractReceiptStyles(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  return match ? match[1] : '';
}

function extractReceiptPage(html) {
  const start = html.indexOf('<div class="page">');
  if (start === -1) return '';

  const scriptIdx = html.indexOf('<script', start);
  const endSearch = scriptIdx !== -1 ? scriptIdx : html.length;
  const chunk = html.slice(start, endSearch);
  const lastClose = chunk.lastIndexOf('</div>');
  if (lastClose === -1) return '';

  return chunk.slice(0, lastClose + 6);
}

class ReceiptController {
  static async getReceiptsPage(req, res) {
    try {
      res.render('payments/receipts', {
        title: 'Receipt',
        subTitle: 'Receipt',
        activePage: 'receipts',
        user: req.user,
        defaultReceivedBy: req.user?.FULLNAME || ''
      });
    } catch (error) {
      console.error('Error rendering receipts page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  static async getAll(req, res) {
    try {
      const data = await PaymentReceiptModel.getAll();
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching receipts:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receipts',
        error: error.message
      });
    }
  }

  static async searchBookedGuests(req, res) {
    try {
      const q = (req.query.q || '').trim();
      const data = await PaymentReceiptModel.searchBookedGuests(q);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching booked guests:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching booked guests',
        error: error.message
      });
    }
  }

  static async getById(req, res) {
    try {
      const data = await PaymentReceiptModel.getById(req.params.id);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Receipt not found' });
      }
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching receipt:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching receipt',
        error: error.message
      });
    }
  }

  static async create(req, res) {
    try {
      const payload = parseReceiptPayload(req.body);

      if (!payload.ROOM_NO) {
        return res.status(400).json({ success: false, message: 'Room No. is required' });
      }
      if (!payload.RECEIVED_FROM) {
        return res.status(400).json({ success: false, message: 'Received From is required' });
      }
      if (!payload.AMOUNT_PAID || Number.isNaN(payload.AMOUNT_PAID)) {
        return res.status(400).json({ success: false, message: 'Amount Paid is required' });
      }
      if (payload.PAYMENT_METHOD === 'other' && !payload.PAYMENT_METHOD_OTHER) {
        return res.status(400).json({ success: false, message: 'Please specify the other payment method' });
      }

      const settings = await ReceiptSettingsModel.getOrCreate();
      const prefix = (settings.RECEIPT_PREFIX || 'RCP').trim() || 'RCP';

      payload.RECEIPT_NO = `${prefix}-TEMP`;
      payload.ENCODED_BY = req.user?.userId || null;
      payload.ENCODED_DT = new Date();

      const result = await PaymentReceiptModel.create(payload);

      const receiptNo = `${prefix}-${result.id}`;
      await PaymentReceiptModel.updateReceiptNo(result.id, receiptNo);
      result.RECEIPT_NO = receiptNo;

      res.json({
        success: true,
        message: 'Receipt created successfully',
        data: result
      });
    } catch (error) {
      console.error('Error creating receipt:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating receipt',
        error: error.message
      });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Receipt ID is required' });
      }

      const existing = await PaymentReceiptModel.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Receipt not found' });
      }

      const payload = parseReceiptPayload(req.body);
      payload.IDNo = id;
      payload.RECEIPT_NO = existing.RECEIPT_NO || `${(await ReceiptSettingsModel.getOrCreate()).RECEIPT_PREFIX || 'RCP'}-${id}`;
      payload.EDITED_BY = req.user?.userId || null;
      payload.EDITED_DT = new Date();

      if (!payload.ROOM_NO) {
        return res.status(400).json({ success: false, message: 'Room No. is required' });
      }
      if (!payload.RECEIVED_FROM) {
        return res.status(400).json({ success: false, message: 'Received From is required' });
      }
      if (!payload.AMOUNT_PAID || Number.isNaN(payload.AMOUNT_PAID)) {
        return res.status(400).json({ success: false, message: 'Amount Paid is required' });
      }
      if (payload.PAYMENT_METHOD === 'other' && !payload.PAYMENT_METHOD_OTHER) {
        return res.status(400).json({ success: false, message: 'Please specify the other payment method' });
      }

      await PaymentReceiptModel.update(payload);
      res.json({ success: true, message: 'Receipt updated successfully' });
    } catch (error) {
      console.error('Error updating receipt:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating receipt',
        error: error.message
      });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await PaymentReceiptModel.delete(id, req.user?.userId || null);

      if (!result?.affectedRows) {
        return res.status(404).json({ success: false, message: 'Receipt not found' });
      }

      res.json({ success: true, message: 'Receipt deleted successfully' });
    } catch (error) {
      console.error('Error deleting receipt:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting receipt',
        error: error.message
      });
    }
  }

  static async printReceipt(req, res) {
    try {
      const record = await PaymentReceiptModel.getById(req.params.id);
      if (!record) return res.status(404).send('Receipt not found');

      const viewData = mapReceiptRecordToViewData(record);
      const context = await getReceiptRenderContext(viewData, req.query.embed);
      res.render('payments/payment_receipt', context);
    } catch (error) {
      console.error('Error printing receipt:', error);
      res.status(500).send('Failed to load receipt for printing');
    }
  }

  static async printBulk(req, res) {
    try {
      const ids = String(req.query.ids || '')
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (!ids.length) {
        return res.status(400).send('No receipts selected');
      }

      const records = [];
      for (const id of ids) {
        const record = await PaymentReceiptModel.getById(id);
        if (record) records.push(record);
      }

      if (!records.length) {
        return res.status(404).send('No receipts found');
      }

      const templatePath = path.join(__dirname, '../views/payments/payment_receipt.ejs');
      let sharedStyles = '';
      const pages = [];

      for (const record of records) {
        const context = await getReceiptRenderContext(
          mapReceiptRecordToViewData(record),
          true
        );
        const html = await ejs.renderFile(templatePath, context);

        if (!sharedStyles) {
          sharedStyles = extractReceiptStyles(html);
        }

        const page = extractReceiptPage(html);
        if (page) pages.push(page);
      }

      if (!pages.length) {
        return res.status(404).send('No receipts found');
      }

      const bulkStyles = `
        .receipt-print-sheet .page {
          min-height: auto;
          height: auto;
        }
        @media print {
          .receipt-print-sheet {
            page-break-after: always;
            break-after: page;
          }
          .receipt-print-sheet:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .receipt-print-sheet .page {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `;

      const combinedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipts</title>
  <style>
    ${sharedStyles}
    ${bulkStyles}
  </style>
</head>
<body>
  ${pages.map((page) => `<div class="receipt-print-sheet">${page}</div>`).join('')}
</body>
</html>`;

      res.send(combinedHtml);
    } catch (error) {
      console.error('Error printing bulk receipts:', error);
      res.status(500).send('Failed to load receipts for printing');
    }
  }

  static async blankReceipt(req, res) {
    try {
      const viewData = mapBlankReceiptViewData();
      const context = await getReceiptRenderContext(viewData, req.query.embed);
      res.render('payments/payment_receipt', context);
    } catch (error) {
      console.error('Error rendering blank receipt:', error);
      res.status(500).send('Failed to load payment receipt');
    }
  }

  static formatMethodLabel(method, other) {
    return formatPaymentMethodLabel(method, other);
  }
}

module.exports = ReceiptController;
