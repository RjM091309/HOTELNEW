const { queryDatabasePromise } = require('../config/database');

class PropertyModel {
  static async getAllActive() {
    return queryDatabasePromise(
      `SELECT IDNo, CODE, NAME, IS_DEFAULT FROM property WHERE ACTIVE = 1 ORDER BY IS_DEFAULT DESC, NAME ASC`
    );
  }

  static async getById(propertyId) {
    const rows = await queryDatabasePromise(
      `SELECT IDNo, CODE, NAME, IS_DEFAULT FROM property WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`,
      [propertyId]
    );
    return rows[0] || null;
  }

  static async getByCode(code) {
    const rows = await queryDatabasePromise(
      `SELECT IDNo, CODE, NAME, IS_DEFAULT FROM property WHERE CODE = ? AND ACTIVE = 1 LIMIT 1`,
      [code]
    );
    return rows[0] || null;
  }

  static async getDefault() {
    const rows = await queryDatabasePromise(
      `SELECT IDNo, CODE, NAME, IS_DEFAULT FROM property WHERE IS_DEFAULT = 1 AND ACTIVE = 1 LIMIT 1`
    );
    return rows[0] || null;
  }

  // Resolves the "current_property" cookie value (a property.CODE) to a
  // property row, falling back to the default property (Main Hotel) when
  // the cookie is missing, points at an unknown code, or points at a
  // deactivated property - never a crash, never an arbitrary property.
  static async resolveFromCookie(codeFromCookie) {
    if (codeFromCookie) {
      const match = await this.getByCode(codeFromCookie);
      if (match) return match;
    }
    return this.getDefault();
  }
}

module.exports = PropertyModel;
