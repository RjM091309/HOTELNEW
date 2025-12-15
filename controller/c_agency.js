const AgencyModel = require('../models/agencyModel');

class AgencyController {
  // Render agency management page
  static async renderAgencyPage(req, res) {
    try {
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('agency/agency-management', {
        title: 'Agency Management',
        subTitle: 'Agency Management',
        activePage: 'agency',
        user: user
      });
    } catch (error) {
      console.error('Error rendering agency page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // API endpoint to get agencies data
  static async getAgenciesData(req, res) {
    try {
      const agencies = await AgencyModel.getAllAgencies();
      res.json({ 
        success: true, 
        agencies: agencies 
      });
    } catch (error) {
      console.error('Error fetching agencies data:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving agencies data.' 
      });
    }
  }

  // Get bookings for a specific agency
  static async getAgencyBookings(req, res) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Agency ID is required' });
      }

      const bookings = await AgencyModel.getAgencyBookings(id);
      res.json({ success: true, bookings });
    } catch (error) {
      console.error('Error fetching agency bookings:', error);
      res.status(500).json({ success: false, message: 'Error retrieving agency bookings.' });
    }
  }

  // Add a new agency
  static async addAgency(req, res) {
    try {
      const { name, contactNumber } = req.body;
      
      if (!name || name.trim() === '') {
        return res.json({ success: false, message: 'Agency name is required.' });
      }

      // Check if agency name already exists
      const nameExists = await AgencyModel.checkAgencyNameExists(name);
      if (nameExists) {
        return res.json({ success: false, message: 'Agency name already exists.' });
      }

      // Use JWT userId (numeric) to match ENCODED_BY int column
      const encodedBy = req.user ? req.user.userId : null;
      const result = await AgencyModel.addAgency(name.trim(), contactNumber, encodedBy);
      
      if (result.success) {
        // Fetch the newly created agency to return complete data
        const newAgency = await AgencyModel.getAgencyById(result.id);
        res.json({ 
          success: true, 
          message: 'Agency added successfully!',
          agency: newAgency
        });
      } else {
        res.status(500).json({ success: false, message: 'Error adding agency.' });
      }
    } catch (error) {
      console.error('Error adding agency:', error);
      res.status(500).json({ success: false, message: 'Error adding agency.' });
    }
  }

  // Get agency by ID
  static async getAgencyById(req, res) {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ message: 'Agency ID is required' });
      }

      const agency = await AgencyModel.getAgencyById(id);
      
      if (!agency) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      res.json({ success: true, agency });
    } catch (error) {
      console.error('Error fetching agency data:', error);
      res.status(500).json({ message: 'Error fetching agency data' });
    }
  }

  // Update an existing agency
  static async updateAgency(req, res) {
    try {
      const id = req.params.id;
      const { name, contactNumber } = req.body;

      if (!name || name.trim() === '') {
        return res.json({ success: false, message: 'Agency name is required.' });
      }

      // Check if agency name already exists (excluding current agency)
      const nameExists = await AgencyModel.checkAgencyNameExists(name, id);
      if (nameExists) {
        return res.json({ success: false, message: 'Agency name already exists.' });
      }

      // Use JWT userId (numeric) to match EDITED_BY int column
      const editedBy = req.user ? req.user.userId : null;
      const result = await AgencyModel.updateAgency(id, name.trim(), contactNumber, editedBy);
      
      if (result.success) {
        // Fetch the updated agency to return complete data
        const updatedAgency = await AgencyModel.getAgencyById(id);
        res.json({ 
          success: true, 
          message: 'Agency updated successfully!',
          agency: updatedAgency
        });
      } else if (result.notFound) {
        res.status(404).json({ success: false, message: 'Agency not found or already inactive.' });
      } else {
        res.status(500).json({ success: false, message: 'Error updating agency.' });
      }
    } catch (error) {
      console.error('Error updating agency:', error);
      res.status(500).json({ success: false, message: 'Error updating agency.' });
    }
  }

  // Soft delete an agency
  static async deleteAgency(req, res) {
    try {
      const agencyId = req.params.id;
      const result = await AgencyModel.deleteAgency(agencyId);
      
      if (result.success) {
        res.status(200).json({ 
          success: true,
          message: 'Agency deleted successfully' 
        });
      } else if (result.hasBookings) {
        res.status(400).json({ 
          success: false,
          message: result.message 
        });
      } else if (result.notFound) {
        res.status(404).json({ 
          success: false,
          message: 'Agency not found or already inactive' 
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: 'Error deleting agency' 
        });
      }
    } catch (error) {
      console.error('Error deleting agency:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error deleting agency' 
      });
    }
  }
}

module.exports = AgencyController;

