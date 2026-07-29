const fs = require('fs').promises;
const path = require('path');
const ReceiptSettingsModel = require('../models/receiptSettingsModel');

async function loadReceiptLogo() {
  try {
    const logoPath = path.join(__dirname, '../public/img/Logo-Black.png');
    const logoBuf = await fs.readFile(logoPath);
    return `data:image/png;base64,${logoBuf.toString('base64')}`;
  } catch (_) {
    return '';
  }
}

async function loadReceiptTemplateSettings() {
  const settings = await ReceiptSettingsModel.getOrCreate();
  return {
    hotelName: settings.HOTEL_NAME || 'MAIN STAY HOTEL',
    receiptTitle: settings.RECEIPT_TITLE || 'Payment Receipt',
    acknowledgmentText: settings.ACKNOWLEDGMENT_TEXT || 'This receipt acknowledges that the payment described above has been received.',
    receiptPrefix: settings.RECEIPT_PREFIX || 'RCP',
    showLogo: settings.SHOW_LOGO === 1 || settings.SHOW_LOGO === true
  };
}

function formatPaymentMethodLabel(method, otherLabel = '') {
  const labels = {
    cash: 'Cash',
    credit_card: 'Credit Card',
    credit: 'Credit',
    marker: 'Credit',
    check: 'Check',
    bank_transfer: 'Bank Transfer',
    gcash: 'GCash',
    online: 'Online'
  };
  const key = (method || '').toLowerCase();
  if (key === 'other') return otherLabel || 'Others';
  return labels[key] || method || '';
}

function mapReceiptRecordToViewData(record) {
  const methodKey = (record.PAYMENT_METHOD || '').toLowerCase();
  const otherLabel = record.PAYMENT_METHOD_OTHER || '';
  return {
    isBlank: false,
    roomNo: record.ROOM_NO || '',
    receiptDate: record.RECEIPT_DATE || new Date(),
    receivedFrom: record.RECEIVED_FROM || '',
    amountPaid: Number(record.AMOUNT_PAID || 0),
    paymentMethod: methodKey,
    paymentMethodLabel: formatPaymentMethodLabel(methodKey, otherLabel),
    purpose: record.PURPOSE || '',
    receivedBy: record.RECEIVED_BY || ''
  };
}

function mapBlankReceiptViewData() {
  return {
    isBlank: true,
    roomNo: '',
    receiptDate: '',
    receivedFrom: '',
    amountPaid: '',
    paymentMethod: '',
    paymentMethodLabel: '',
    purpose: '',
    receivedBy: ''
  };
}

async function getReceiptRenderContext(viewData, embed) {
  const templateSettings = await loadReceiptTemplateSettings();
  const logoUrl = templateSettings.showLogo ? await loadReceiptLogo() : '';
  return {
    layout: false,
    embed: embed === '1' || embed === true,
    logoUrl,
    ...templateSettings,
    ...viewData
  };
}

module.exports = {
  loadReceiptLogo,
  loadReceiptTemplateSettings,
  formatPaymentMethodLabel,
  mapReceiptRecordToViewData,
  mapBlankReceiptViewData,
  getReceiptRenderContext
};
