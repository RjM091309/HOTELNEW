const ActivityLogModel = require('../models/activityLogModel');

const ActivityLogController = {
  // Render the Activity Log page (Management menu)
  renderPage: async (req, res) => {
    try {
      const user = req.user || null;
      res.render('activity_log/activity_log', {
        title: 'Activity Log',
        subTitle: 'Audit Trail',
        activePage: 'activity_log',
        user
      });
    } catch (error) {
      console.error('Error rendering activity log page:', error);
      res.status(500).send('Error loading activity log page.');
    }
  },

  // JSON data for the DataTable
  getData: async (req, res) => {
    try {
      const { module, action, bookingId, userId, status, search, dateFrom, dateTo, limit, offset } = req.query;

      const rows = await ActivityLogModel.getLogs({
        module: module || undefined,
        action: action || undefined,
        bookingId: bookingId || undefined,
        userId: userId || undefined,
        status: status || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: limit || 200,
        offset: offset || 0
      });

      res.json({ success: true, count: rows.length, rows });
    } catch (error) {
      console.error('Error fetching activity log data:', error);
      res.status(500).json({ success: false, message: 'Error retrieving activity log data.' });
    }
  },

  // Filter dropdown options
  getFilterOptions: async (req, res) => {
    try {
      const options = await ActivityLogModel.getFilterOptions();
      res.json({ success: true, ...options });
    } catch (error) {
      console.error('Error fetching activity log filter options:', error);
      res.status(500).json({ success: false, message: 'Error retrieving filter options.' });
    }
  }
};

module.exports = ActivityLogController;
