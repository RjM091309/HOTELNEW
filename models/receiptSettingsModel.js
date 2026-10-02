const { queryDatabasePromise } = require('../config/database');

const DEFAULT_SETTINGS = {
  HOTEL_NAME: 'MAIN STAY HOTEL',
  RECEIPT_TITLE: 'Payment Receipt',
  ACKNOWLEDGMENT_TEXT: 'This receipt acknowledges that the payment described above has been received.',
  RECEIPT_PREFIX: 'RCP',
  SHOW_LOGO: 1
};

class ReceiptSettingsModel {
  // propertyId scopes which hotel's branding (HOTEL_NAME in particular)
  // shows on a printed receipt - see getOrCreate() below for how a missing
  // row gets created with that property's own name as the default.
  static async getSettings(propertyId) {
    const rows = await queryDatabasePromise(
      `SELECT IDNo, HOTEL_NAME, RECEIPT_TITLE, ACKNOWLEDGMENT_TEXT, RECEIPT_PREFIX, SHOW_LOGO,
              ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT
       FROM receipt_settings
       WHERE PROPERTY_ID = ? AND ACTIVE = 1
       ORDER BY IDNo ASC
       LIMIT 1`,
      [propertyId]
    );
    return rows[0] || null;
  }

  static async getOrCreate(propertyId) {
    let settings = await this.getSettings(propertyId);
    if (settings) return settings;

    // First receipt print for this property - default HOTEL_NAME to the
    // property's own display name (e.g. "Pool Villa") rather than the
    // generic default, so a freshly-added property is correctly branded
    // without anyone having to visit a settings screen first.
    const [property] = await queryDatabasePromise(`SELECT NAME FROM property WHERE IDNo = ?`, [propertyId]);
    const hotelName = property?.NAME || DEFAULT_SETTINGS.HOTEL_NAME;

    await queryDatabasePromise(
      `INSERT INTO receipt_settings
       (HOTEL_NAME, RECEIPT_TITLE, ACKNOWLEDGMENT_TEXT, RECEIPT_PREFIX, SHOW_LOGO, ACTIVE, PROPERTY_ID)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        hotelName,
        DEFAULT_SETTINGS.RECEIPT_TITLE,
        DEFAULT_SETTINGS.ACKNOWLEDGMENT_TEXT,
        DEFAULT_SETTINGS.RECEIPT_PREFIX,
        DEFAULT_SETTINGS.SHOW_LOGO,
        propertyId
      ]
    );

    return await this.getSettings(propertyId);
  }
}

module.exports = ReceiptSettingsModel;
