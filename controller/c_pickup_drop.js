const PickupDropModel = require('../models/pickupDropModel');

function formatFlightNumber(record) {
  const parts = [record.FLIGHT_NUMBER, record.DROPOFF_FLIGHT_NUMBER]
    .filter((value) => value != null && String(value).trim() !== '');
  return parts.join(' / ') || '-';
}

function getPrintFlightNumber(record, type) {
  const value = type === 'dropoff' ? record.DROPOFF_FLIGHT_NUMBER : record.FLIGHT_NUMBER;
  return value && String(value).trim() ? String(value).trim() : '-';
}

class PickupDropController {
  static async getPickupDropPage(req, res) {
    try {
      res.render('pickup_drop/pickup_drop', {
        title: 'Pick Up & Drop',
        subTitle: 'Pick Up & Drop',
        activePage: 'pickup_drop',
        user: req.user
      });
    } catch (error) {
      console.error('Error rendering pickup & drop page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  static async getPrintPage(req, res) {
    try {
      const { id } = req.params;
      const data = await PickupDropModel.getByBookingId(id);

      if (!data) {
        return res.status(404).send('Record not found');
      }

      const guestName = data.NAME || '';
      const printType = req.query.type === 'dropoff' ? 'dropoff' : 'pickup';
      res.render('pickup_drop/print', {
        layout: false,
        embed: req.query.embed === '1',
        guestName,
        flightNo: getPrintFlightNumber(data, printType),
        personCount: data.PASSENGER_COUNT != null ? data.PASSENGER_COUNT : '-',
        specialNotes: data.PICKUP_DROP_SPECIAL_NOTES || '',
        printType
      });
    } catch (error) {
      console.error('Error rendering pickup & drop print page:', error);
      res.status(500).send('Error loading print page');
    }
  }

  static async getAll(req, res) {
    try {
      const data = await PickupDropModel.getAll();
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching pickup & drop records:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching pickup & drop records',
        error: error.message
      });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const data = await PickupDropModel.getByBookingId(id);

      if (!data) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching pickup & drop record:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching pickup & drop record',
        error: error.message
      });
    }
  }

  static async update(req, res) {
    try {
      const { id, flightNumber, dropoffFlightNumber, personCount, specialNotes } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Booking ID is required' });
      }

      const existing = await PickupDropModel.getByBookingId(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      const parsedPersonCount = personCount !== '' && personCount != null
        ? parseInt(personCount, 10)
        : null;

      if (parsedPersonCount != null && (Number.isNaN(parsedPersonCount) || parsedPersonCount < 1)) {
        return res.status(400).json({
          success: false,
          message: 'No. of persons must be a positive number'
        });
      }

      await PickupDropModel.updateBooking(id, {
        FLIGHT_NUMBER: flightNumber ? String(flightNumber).trim().toUpperCase() : null,
        DROPOFF_FLIGHT_NUMBER: dropoffFlightNumber ? String(dropoffFlightNumber).trim().toUpperCase() : null,
        PASSENGER_COUNT: parsedPersonCount,
        PICKUP_DROP_SPECIAL_NOTES: specialNotes != null ? String(specialNotes).trim() : null,
        EDITED_BY: req.user?.userId || null,
        EDITED_DT: new Date()
      });

      res.json({ success: true, message: 'Pickup & drop record updated successfully' });
    } catch (error) {
      console.error('Error updating pickup & drop record:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating pickup & drop record',
        error: error.message
      });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user?.userId || null;
      const result = await PickupDropModel.removePickDropServices(id, editedBy);

      if (!result?.affectedRows) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      res.json({ success: true, message: 'Pickup & drop services removed successfully' });
    } catch (error) {
      console.error('Error deleting pickup & drop record:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting pickup & drop record',
        error: error.message
      });
    }
  }
}

module.exports = PickupDropController;
