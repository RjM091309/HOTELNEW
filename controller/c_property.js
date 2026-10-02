const PropertyModel = require('../models/propertyModel');

const propertyController = {
  // Sets the "current_property" cookie the switcher UI (partials/navbar.ejs)
  // toggles, read back by middleware/m_auth.js's attachProperty() on every
  // subsequent request. Long-lived (90 days) so it survives logout/login -
  // staff logins are shared across properties, only the viewed data changes.
  switchProperty: async (req, res) => {
    try {
      const { code } = req.body;
      const property = await PropertyModel.getByCode(code);
      if (!property) {
        return res.status(400).json({ success: false, message: 'Unknown property' });
      }

      res.cookie('current_property', property.CODE, {
        maxAge: 90 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        sameSite: 'lax'
      });

      res.json({ success: true, property });
    } catch (err) {
      console.error('Error switching property:', err);
      res.status(500).json({ success: false, message: 'Failed to switch property' });
    }
  }
};

module.exports = propertyController;
