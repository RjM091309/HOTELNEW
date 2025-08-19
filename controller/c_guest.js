const GuestModel = require('../models/guestModel');

class GuestController {
  // Main guest profile page
  static async getGuestProfile(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      // Get all guest data in parallel (following dashboard pattern)
      const [
        guestsResults,
        guestTypes,
        guestLevels,
        guestStats
      ] = await Promise.all([
        GuestModel.getAllGuests(),
        GuestModel.getGuestTypes(),
        GuestModel.getGuestLevels(),
        GuestModel.getGuestStatistics()
      ]);

      // Process guest data (following dashboard pattern)
      const processedGuests = GuestModel.processGuestData(guestsResults);

      res.render('guest/guest-profile', {
        title: 'Guest Profile',
        subTitle: 'Guest Management',
        activePage: 'guest',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder,
        guests: processedGuests,
        guestTypes,
        guestLevels,
        guestStats,
        timeAgo: GuestModel.timeAgo
      });

    } catch (error) {
      console.error('Error loading guest profile:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // API endpoint to get all guests for DataTable
  static async getAllGuests(req, res) {
    try {
      const guests = await GuestModel.getAllGuests();
      res.json({
        success: true,
        data: guests
      });
    } catch (error) {
      console.error('Error fetching guests:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guests',
        error: error.message
      });
    }
  }

  // API endpoint to get guest by ID
  static async getGuestById(req, res) {
    try {
      const { id } = req.params;
      const guest = await GuestModel.getGuestById(id);
      if (guest) {
        res.json({
          success: true,
          data: guest
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest not found'
        });
      }
    } catch (error) {
      console.error('Error fetching guest by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest',
        error: error.message
      });
    }
  }

  // API endpoint to get guest bookings
  static async getGuestBookings(req, res) {
    try {
      const { id } = req.params;
      const bookings = await GuestModel.getGuestBookings(id);
      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      console.error('Error fetching guest bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest bookings',
        error: error.message
      });
    }
  }

  // API endpoint to update guest
  static async updateGuest(req, res) {
    try {
      const { IDNo, NAME, CONTACTNo, TYPE, LEVEL } = req.body;
      
      if (!IDNo || !NAME || !CONTACTNo || !TYPE || !LEVEL) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      const result = await GuestModel.updateGuest(IDNo, NAME, CONTACTNo, TYPE, LEVEL);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest not found'
        });
      }
    } catch (error) {
      console.error('Error updating guest:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating guest',
        error: error.message
      });
    }
  }

  // API endpoint to create new guest
  static async createGuest(req, res) {
    try {
      const { NAME, CONTACTNo, TYPE, LEVEL } = req.body;
      
      if (!NAME || !CONTACTNo || !TYPE || !LEVEL) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      const result = await GuestModel.createGuest(NAME, CONTACTNo, TYPE, LEVEL);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest created successfully',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to create guest'
        });
      }
    } catch (error) {
      console.error('Error creating guest:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating guest',
        error: error.message
      });
    }
  }

  // API endpoint to delete guest
  static async deleteGuest(req, res) {
    try {
      const { id } = req.params;
      
      const result = await GuestModel.deleteGuest(id);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest not found'
        });
      }
    } catch (error) {
      console.error('Error deleting guest:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting guest',
        error: error.message
      });
    }
  }

  // API endpoint to get guest statistics
  static async getGuestStatistics(req, res) {
    try {
      const stats = await GuestModel.getGuestStatistics();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching guest statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest statistics',
        error: error.message
      });
    }
  }


// GUEST TYPE AND LEVEL
  static async getGuestTypePage(req, res) {
    try {
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('file_maintenance/guest_type', {
        title: 'Guest Type',
        subTitle: 'File Maintenance',
        activePage: 'guest_type',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });
    } catch (error) {
      console.error('Error loading guest type page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // API endpoint to get all guest types
  static async getAllGuestTypes(req, res) {
    try {
      const guestTypes = await GuestModel.getAllGuestTypes();
      res.json({
        success: true,
        data: guestTypes
      });
    } catch (error) {
      console.error('Error fetching guest types:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest types',
        error: error.message
      });
    }
  }

  static async getGuestLevelPage(req, res) {
    try {
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('file_maintenance/guest_level', {
        title: 'Guest Level',
        subTitle: 'File Maintenance',
        activePage: 'guest_level',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });
    } catch (error) {
      console.error('Error loading guest level page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // API endpoint to get all guest levels
  static async getAllGuestLevels(req, res) {
    try {
      const guestLevels = await GuestModel.getAllGuestLevels();
      res.json({
        success: true,
        data: guestLevels
      });
    } catch (error) {
      console.error('Error fetching guest levels:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest levels',
        error: error.message
      });
    }
  }

  // Guest Type API Methods
  static async addGuestType(req, res) {
    try {
      const { txtTypeGuest, ACTIVE } = req.body;

      if (!txtTypeGuest || ACTIVE === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Guest type and status are required'
        });
      }

      const result = await GuestModel.addGuestType(txtTypeGuest, ACTIVE);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest type added successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to add guest type'
        });
      }
    } catch (error) {
      console.error('Error adding guest type:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding guest type',
        error: error.message
      });
    }
  }

  static async getGuestTypeById(req, res) {
    try {
      const { id } = req.params;
      const guestType = await GuestModel.getGuestTypeById(id);
      
      if (guestType) {
        res.json({
          success: true,
          data: guestType
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest type not found'
        });
      }
    } catch (error) {
      console.error('Error fetching guest type:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest type',
        error: error.message
      });
    }
  }

  static async editGuestType(req, res) {
    try {
      const { id } = req.params;
      const { TYPE, ACTIVE } = req.body;

      if (!TYPE || ACTIVE === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Guest type and status are required'
        });
      }

      const result = await GuestModel.editGuestType(id, TYPE, ACTIVE);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest type updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest type not found'
        });
      }
    } catch (error) {
      console.error('Error updating guest type:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating guest type',
        error: error.message
      });
    }
  }

  static async toggleGuestType(req, res) {
    try {
      const { id } = req.params;
      const { ACTIVE } = req.body;

      const result = await GuestModel.toggleGuestType(id, ACTIVE);
      
      if (result) {
        res.json({
          success: true,
          message: 'Status updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest type not found'
        });
      }
    } catch (error) {
      console.error('Error updating guest type status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating status',
        error: error.message
      });
    }
  }

  static async deleteGuestType(req, res) {
    try {
      const { id } = req.params;
      const result = await GuestModel.deleteGuestType(id);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest type deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest type not found'
        });
      }
    } catch (error) {
      console.error('Error deleting guest type:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting guest type',
        error: error.message
      });
    }
  }

  // Guest Level API Methods
  static async addGuestLevel(req, res) {
    try {
      const { TYPE, ACTIVE } = req.body;

      if (!TYPE || ACTIVE === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Guest level and status are required'
        });
      }

      const result = await GuestModel.addGuestLevel(TYPE, ACTIVE);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest level added successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to add guest level'
        });
      }
    } catch (error) {
      console.error('Error adding guest level:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding guest level',
        error: error.message
      });
    }
  }

  static async getGuestLevelById(req, res) {
    try {
      const { id } = req.params;
      const guestLevel = await GuestModel.getGuestLevelById(id);
      
      if (guestLevel) {
        res.json({
          success: true,
          data: guestLevel
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest level not found'
        });
      }
    } catch (error) {
      console.error('Error fetching guest level:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching guest level',
        error: error.message
      });
    }
  }

  static async editGuestLevel(req, res) {
    try {
      const { id } = req.params;
      const { TYPE, ACTIVE } = req.body;

      if (!TYPE || ACTIVE === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Guest level and status are required'
        });
      }

      const result = await GuestModel.editGuestLevel(id, TYPE, ACTIVE);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest level updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest level not found'
        });
      }
    } catch (error) {
      console.error('Error updating guest level:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating guest level',
        error: error.message
      });
    }
  }

  static async toggleGuestLevel(req, res) {
    try {
      const { id } = req.params;
      const { ACTIVE } = req.body;

      const result = await GuestModel.toggleGuestLevel(id, ACTIVE);
      
      if (result) {
        res.json({
          success: true,
          message: 'Status updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest level not found'
        });
      }
    } catch (error) {
      console.error('Error updating guest level status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating status',
        error: error.message
      });
    }
  }

  static async deleteGuestLevel(req, res) {
    try {
      const { id } = req.params;
      const result = await GuestModel.deleteGuestLevel(id);
      
      if (result) {
        res.json({
          success: true,
          message: 'Guest level deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Guest level not found'
        });
      }
    } catch (error) {
      console.error('Error deleting guest level:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting guest level',
        error: error.message
      });
    }
  }
}

module.exports = GuestController; 