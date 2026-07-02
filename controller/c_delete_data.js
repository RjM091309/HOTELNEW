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

      const result = await DeleteDataModel.purgeTestData();

      res.json({
        success: true,
        message: 'Test data deleted successfully. All rooms set to available.',
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
