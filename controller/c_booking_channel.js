// ========================================
// BOOKING CHANNEL CONTROLLER
// ========================================

const BookingChannelModel = require('../models/bookingChannelModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/img/booking_channel';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'channel-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('channelImg');

class BookingChannelController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Get booking channel management page
  static async getBookingChannelManagement(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('booking/booking_channel', {
        title: 'OTA Management',
        subTitle: 'Manage your OTA channels',
        page: 'booking-channel',
        activePage: 'booking_channel',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });
    } catch (error) {
      console.error('Error rendering booking channel management page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }
  
  // ========================================
  // API ENDPOINTS
  // ========================================
  
  // Get all booking channels
  static async getAllBookingChannels(req, res) {
    try {
      const channels = await BookingChannelModel.getAllBookingChannels();
      
      res.json({
        success: true,
        data: channels
      });
    } catch (error) {
      console.error('Error fetching booking channels:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching booking channels',
        error: error.message
      });
    }
  }

  // Get booking channel by ID
  static async getBookingChannelById(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Channel ID is required'
        });
      }

      const channel = await BookingChannelModel.getBookingChannelById(id);
      
      if (channel) {
        res.json({
          success: true,
          data: channel
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Booking channel not found'
        });
      }
    } catch (error) {
      console.error('Error fetching booking channel:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching booking channel',
        error: error.message
      });
    }
  }

  // Create new booking channel
  static async createBookingChannel(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { name, api_key, status } = req.body;
        
        // Debug logging
        console.log('Received form data:', { name, api_key, status, body: req.body });
        
        if (!name || !api_key || !status) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Get image filename if uploaded
        const img = req.file ? req.file.filename : null;

        const channelData = {
          name,
          api_key,
          status,
          img
        };

        const result = await BookingChannelModel.createBookingChannel(channelData);
        
        if (result) {
          res.json({
            success: true,
            message: 'Booking channel created successfully',
            data: { id: result.insertId }
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Failed to create booking channel'
          });
        }
      } catch (error) {
        console.error('Error creating booking channel:', error);
        res.status(500).json({
          success: false,
          message: 'Error creating booking channel',
          error: error.message
        });
      }
    });
  }

  // Update booking channel
  static async updateBookingChannel(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { id, name, api_key, status } = req.body;
        
        if (!id || !name || !api_key || !status) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Get image filename if uploaded
        const newImg = req.file ? req.file.filename : null;

        let img = newImg;
        
        // If no new image uploaded, get existing image
        if (!newImg) {
          const existingChannel = await BookingChannelModel.getBookingChannelById(id);
          img = existingChannel.img || null;
        }

        const channelData = {
          id,
          name,
          api_key,
          status,
          img
        };

        const result = await BookingChannelModel.updateBookingChannel(channelData);
        
        if (result) {
          res.json({
            success: true,
            message: 'Booking channel updated successfully'
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'Booking channel not found'
          });
        }
      } catch (error) {
        console.error('Error updating booking channel:', error);
        res.status(500).json({
          success: false,
          message: 'Error updating booking channel',
          error: error.message
        });
      }
    });
  }

  // Toggle booking channel status
  static async toggleChannelStatus(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Channel ID is required'
        });
      }

      const result = await BookingChannelModel.toggleChannelStatus(id);
      
      if (result) {
        res.json({
          success: true,
          message: 'Channel status updated successfully',
          newStatus: result.status
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Booking channel not found'
        });
      }
    } catch (error) {
      console.error('Error toggling channel status:', error);
      res.status(500).json({
        success: false,
        message: 'Error toggling channel status',
        error: error.message
      });
    }
  }
}

module.exports = BookingChannelController;
