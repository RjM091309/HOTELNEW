const DepositsModel = require('../models/depositsModel');

class DepositsController {
  static async getDepositsPage(req, res) {
    try {
      res.render('deposits/deposits', {
        title: 'Deposits',
        subTitle: 'Deposits',
        activePage: 'deposits',
        user: req.user
      });
    } catch (error) {
      console.error('Error rendering deposits page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  static async getAll(req, res) {
    try {
      const [data, summary] = await Promise.all([
        DepositsModel.getAll(),
        DepositsModel.getSummary()
      ]);

      res.json({
        success: true,
        data,
        summary
      });
    } catch (error) {
      console.error('Error fetching deposits:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching deposits',
        error: error.message
      });
    }
  }
}

module.exports = DepositsController;
