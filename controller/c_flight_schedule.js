const FlightScheduleModel = require('../models/flightScheduleModel');

class FlightScheduleController {
  static async getFlightSchedulePage(req, res) {
    try {
      res.render('flight/flight_schedule', {
        title: 'Flight Schedule',
        subTitle: 'Flight Schedule',
        activePage: 'flight_schedule',
        user: req.user
      });
    } catch (error) {
      console.error('Error rendering flight schedule page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  static async getAll(req, res) {
    try {
      const data = await FlightScheduleModel.getAll();
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching flight schedules:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching flight schedules',
        error: error.message
      });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const data = await FlightScheduleModel.getById(id);

      if (!data) {
        return res.status(404).json({ success: false, message: 'Flight schedule not found' });
      }

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching flight schedule:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching flight schedule',
        error: error.message
      });
    }
  }

  static async create(req, res) {
    try {
      const { flightNumber, arrival, departure } = req.body;

      if (!flightNumber || !arrival || !departure) {
        return res.status(400).json({
          success: false,
          message: 'Flight number, arrival, and departure are required'
        });
      }

      const result = await FlightScheduleModel.create({
        FLIGHT_NUMBER: String(flightNumber).trim().toUpperCase(),
        ARRIVAL: String(arrival).trim(),
        DEPARTURE: String(departure).trim(),
        ENCODED_BY: req.user?.userId || null,
        ENCODED_DT: new Date()
      });

      res.json({
        success: true,
        message: 'Flight schedule created successfully',
        data: result
      });
    } catch (error) {
      console.error('Error creating flight schedule:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating flight schedule',
        error: error.message
      });
    }
  }

  static async update(req, res) {
    try {
      const { id, flightNumber, arrival, departure } = req.body;

      if (!id || !flightNumber || !arrival || !departure) {
        return res.status(400).json({
          success: false,
          message: 'Flight ID, flight number, arrival, and departure are required'
        });
      }

      const existing = await FlightScheduleModel.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Flight schedule not found' });
      }

      await FlightScheduleModel.update({
        IDNo: id,
        FLIGHT_NUMBER: String(flightNumber).trim().toUpperCase(),
        ARRIVAL: String(arrival).trim(),
        DEPARTURE: String(departure).trim(),
        EDITED_BY: req.user?.userId || null,
        EDITED_DT: new Date()
      });

      res.json({ success: true, message: 'Flight schedule updated successfully' });
    } catch (error) {
      console.error('Error updating flight schedule:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating flight schedule',
        error: error.message
      });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user?.userId || null;
      const result = await FlightScheduleModel.delete(id, editedBy);

      if (!result?.affectedRows) {
        return res.status(404).json({ success: false, message: 'Flight schedule not found' });
      }

      res.json({ success: true, message: 'Flight schedule deleted successfully' });
    } catch (error) {
      console.error('Error deleting flight schedule:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting flight schedule',
        error: error.message
      });
    }
  }
}

module.exports = FlightScheduleController;
