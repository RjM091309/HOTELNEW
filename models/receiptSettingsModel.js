const { queryDatabasePromise } = require('../config/database');

const DEFAULT_SETTINGS = {
  HOTEL_NAME: 'MAIN STAY HOTEL',
  RECEIPT_TITLE: 'Payment Receipt',
  ACKNOWLEDGMENT_TEXT: 'This receipt acknowledges that the payment described above has been received.',
  RECEIPT_PREFIX: 'RCP',
  SHOW_LOGO: 1
};

class ReceiptSettingsModel {
  static async getSettings() {
    const rows = await queryDatabasePromise(
      `SELECT IDNo, HOTEL_NAME, RECEIPT_TITLE, ACKNOWLEDGMENT_TEXT, RECEIPT_PREFIX, SHOW_LOGO,
              ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT
       FROM receipt_settings
       WHERE ACTIVE = 1
       ORDER BY IDNo ASC
       LIMIT 1`
    );
    return rows[0] || null;
  }

  static async getOrCreate() {
    let settings = await this.getSettings();
    if (settings) return settings;

    await queryDatabasePromise(
      `INSERT INTO receipt_settings
       (HOTEL_NAME, RECEIPT_TITLE, ACKNOWLEDGMENT_TEXT, RECEIPT_PREFIX, SHOW_LOGO, ACTIVE)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        DEFAULT_SETTINGS.HOTEL_NAME,
        DEFAULT_SETTINGS.RECEIPT_TITLE,
        DEFAULT_SETTINGS.ACKNOWLEDGMENT_TEXT,
        DEFAULT_SETTINGS.RECEIPT_PREFIX,
        DEFAULT_SETTINGS.SHOW_LOGO
      ]
    );

    return await this.getSettings();
  }
}

module.exports = ReceiptSettingsModel;
