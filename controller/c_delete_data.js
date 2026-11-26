const DeleteDataModel = require('../models/deleteDataModel');

function isAdminUser(user) {
  return user && Number(user.PERMISSIONS) === 1;
}

const DeleteDataController = {
  purgeTestData: async (req, res) => {
    try {
      if (!isAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin only.'
        });
      }

      // The property the admin confirmed in the dialog must be the one this request is for (a tab left open on another property,
      // or an old cached script that sends none, must never delete anything).
      const confirmedId = Number(req.body && req.body.propertyId);
      if (!req.propertyId || confirmedId !== Number(req.propertyId)) {
        return res.status(409).json({
          success: false,
          message: 'The active property does not match. Nothing was deleted. Refresh the page and try again.'
        });
      }

      const result = await DeleteDataModel.purgeTestData(req.propertyId);
      const name = res.locals.propertyDisplayName || 'this property';

      res.json({
        success: true,
        message: `Data of ${name} deleted. Occupied and dirty rooms are set to available. Settings and other properties were not changed.`,
        deletedCounts: result.deletedCounts
      });
    } catch (error) {
      console.error('Error purging test data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete test data.',
        error: error.message
      });
    }
  }
};

module.exports = DeleteDataController;
