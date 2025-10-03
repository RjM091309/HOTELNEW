// ========================================
// ROOM CONTROLLER
// ========================================

const RoomModel = require('../models/roomModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/img/rooms';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'room-' + uniqueSuffix + path.extname(file.originalname));
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
}).single('ROOM_IMAGE');

class RoomController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Main room management page
  static async getRoomManagement(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('room/room-management', {
        title: 'Room Management',
        subTitle: 'Room Management',
        page: 'room-management',
        activePage: 'room',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });

    } catch (error) {
      console.error('Error loading room management:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // ========================================
  // API ROUTES - ROOM CRUD
  // ========================================
  
  // Get all rooms
  static async getAllRooms(req, res) {
    try {
      const rooms = await RoomModel.getAllRooms();
      res.json({
        success: true,
        data: rooms
      });
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching rooms',
        error: error.message
      });
    }
  }

  // Get room by ID
  static async getRoomById(req, res) {
    try {
      const { id } = req.params;
      const room = await RoomModel.getRoomById(id);
      
      if (room) {
        res.json({
          success: true,
          data: room
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching room',
        error: error.message
      });
    }
  }

  // Create new room
  static async createRoom(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { 
          ROOM_TYPE_ID, 
          ROOM_NUMBER, 
          ROOM_STATUS, 
          ROOM_PRICE, 
          ROOM_MAX, 
          ROOM_BED, 
          ROOM_SIZE, 
          ROOM_VIEW, 
          ROOM_DESCRIPTION,
          AMENITIES,
          SEASONAL_PRICING
        } = req.body;
        
        if (!ROOM_TYPE_ID || !ROOM_NUMBER || !ROOM_STATUS || 
            !ROOM_PRICE || !ROOM_MAX || !ROOM_BED || !ROOM_SIZE || !ROOM_VIEW) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Check if room number already exists
        const existingRoom = await RoomModel.getRoomByNumber(ROOM_NUMBER);
        if (existingRoom) {
          return res.status(400).json({
            success: false,
            message: 'Room number already exists'
          });
        }

        // Get image filename if uploaded
        const ROOM_IMAGE = req.file ? req.file.filename : null;

        // Parse JSON strings
        const parsedAmenities = AMENITIES ? JSON.parse(AMENITIES) : [];
        const parsedSeasonalPricing = SEASONAL_PRICING ? JSON.parse(SEASONAL_PRICING) : [];

        const encodedBy = req.user ? req.user.userId : req.session.userId;
        
        const result = await RoomModel.createRoom(
          ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
          ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
          ROOM_DESCRIPTION, ROOM_IMAGE, parsedAmenities, parsedSeasonalPricing, encodedBy
        );
        
        if (result) {
          res.json({
            success: true,
            message: 'Room created successfully',
            data: { id: result }
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Failed to create room'
          });
        }
      } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({
          success: false,
          message: 'Error creating room',
          error: error.message
        });
      }
    });
  }

  // Update room
  static async updateRoom(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { 
          IDNo,
          ROOM_TYPE_ID, 
          ROOM_NUMBER, 
          ROOM_STATUS, 
          ROOM_PRICE, 
          ROOM_MAX, 
          ROOM_BED, 
          ROOM_SIZE, 
          ROOM_VIEW, 
          ROOM_DESCRIPTION,
          AMENITIES,
          SEASONAL_PRICING
        } = req.body;
        
        if (!IDNo || !ROOM_TYPE_ID || !ROOM_NUMBER || !ROOM_STATUS || 
            !ROOM_PRICE || !ROOM_MAX || !ROOM_BED || !ROOM_SIZE || !ROOM_VIEW) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Check if room number already exists for other rooms
        const existingRoom = await RoomModel.getRoomByNumber(ROOM_NUMBER);
        if (existingRoom && existingRoom.IDNo != IDNo) {
          return res.status(400).json({
            success: false,
            message: 'Room number already exists'
          });
        }

        // Get image filename if uploaded
        const ROOM_IMAGE = req.file ? req.file.filename : null;

        // Parse JSON strings
        const parsedAmenities = AMENITIES ? JSON.parse(AMENITIES) : [];
        const parsedSeasonalPricing = SEASONAL_PRICING ? JSON.parse(SEASONAL_PRICING) : [];

        const editedBy = req.user ? req.user.userId : req.session.userId;
        
        const result = await RoomModel.updateRoom(
          IDNo, ROOM_TYPE_ID, ROOM_NUMBER, ROOM_STATUS,
          ROOM_PRICE, ROOM_MAX, ROOM_BED, ROOM_SIZE, ROOM_VIEW, 
          ROOM_DESCRIPTION, ROOM_IMAGE, parsedAmenities, parsedSeasonalPricing, editedBy
        );
        
        if (result) {
          res.json({
            success: true,
            message: 'Room updated successfully'
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'Room not found'
          });
        }
      } catch (error) {
        console.error('Error updating room:', error);
        res.status(500).json({
          success: false,
          message: 'Error updating room',
          error: error.message
        });
      }
    });
  }



  // Delete room
  static async deleteRoom(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.deleteRoom(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Room deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting room',
        error: error.message
      });
    }
  }

  // ========================================
  // ROOM TYPE CRUD OPERATIONS
  // ========================================
  
  // Get room type by ID
  static async getRoomTypeById(req, res) {
    try {
      const { id } = req.params;
      const roomType = await RoomModel.getRoomTypeById(id);
      
      if (roomType) {
        res.json({
          success: true,
          data: roomType
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Room type not found'
        });
      }
    } catch (error) {
      console.error('Error fetching room type:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching room type',
        error: error.message
      });
    }
  }

  // Create room type
  static async createRoomType(req, res) {
    try {
      console.log('Received request body:', req.body);
      const { NAME, DESCRIPTION, BASE_PRICE } = req.body;
      
      if (!NAME || !BASE_PRICE) {
        return res.status(400).json({
          success: false,
          message: 'Name and base price are required'
        });
      }

      const encodedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.createRoomType(NAME, DESCRIPTION, BASE_PRICE, encodedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Room type created successfully',
          data: { id: result }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to create room type'
        });
      }
    } catch (error) {
      console.error('Error creating room type:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating room type',
        error: error.message
      });
    }
  }

  // Update room type
  static async updateRoomType(req, res) {
    try {
      const { IDNo, NAME, DESCRIPTION, BASE_PRICE } = req.body;
      
      if (!IDNo || !NAME || !BASE_PRICE) {
        return res.status(400).json({
          success: false,
          message: 'ID, name and base price are required'
        });
      }

      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.updateRoomType(IDNo, NAME, DESCRIPTION, BASE_PRICE, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Room type updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Room type not found'
        });
      }
    } catch (error) {
      console.error('Error updating room type:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating room type',
        error: error.message
      });
    }
  }

  // Delete room type
  static async deleteRoomType(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.deleteRoomType(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Room type deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Room type not found'
        });
      }
    } catch (error) {
      console.error('Error deleting room type:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting room type',
        error: error.message
      });
    }
  }

  // ========================================
  // AMENITY CRUD OPERATIONS
  // ========================================
  
  // Get amenity by ID
  static async getAmenityById(req, res) {
    try {
      const { id } = req.params;
      const amenity = await RoomModel.getAmenityById(id);
      
      if (amenity) {
        res.json({
          success: true,
          data: amenity
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Amenity not found'
        });
      }
    } catch (error) {
      console.error('Error fetching amenity:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching amenity',
        error: error.message
      });
    }
  }

  // Create amenity
  static async createAmenity(req, res) {
    try {
      const { NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY } = req.body;
      
      if (!NAME || !IS_PAID || !AVAILABILITY) {
        return res.status(400).json({
          success: false,
          message: 'Name, type and availability are required'
        });
      }

      const encodedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.createAmenity(NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, encodedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Amenity created successfully',
          data: { id: result }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to create amenity'
        });
      }
    } catch (error) {
      console.error('Error creating amenity:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating amenity',
        error: error.message
      });
    }
  }

  // Update amenity
  static async updateAmenity(req, res) {
    try {
      const { IDNo, NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY } = req.body;
      
      if (!IDNo || !NAME || !IS_PAID || !AVAILABILITY) {
        return res.status(400).json({
          success: false,
          message: 'ID, name, type and availability are required'
        });
      }

      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.updateAmenity(IDNo, NAME, DESCRIPTION, IS_PAID, COST, AVAILABILITY, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Amenity updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Amenity not found'
        });
      }
    } catch (error) {
      console.error('Error updating amenity:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating amenity',
        error: error.message
      });
    }
  }

  // Delete amenity
  static async deleteAmenity(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await RoomModel.deleteAmenity(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Amenity deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Amenity not found'
        });
      }
    } catch (error) {
      console.error('Error deleting amenity:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting amenity',
        error: error.message
      });
    }
  }

  // ========================================
  // DROPDOWN DATA
  // ========================================
  
  // Get room types for dropdown
  static async getRoomTypes(req, res) {
    try {
      const roomTypes = await RoomModel.getRoomTypes();
      res.json({
        success: true,
        data: roomTypes
      });
    } catch (error) {
      console.error('Error fetching room types:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching room types',
        error: error.message
      });
    }
  }

  // Get amenities for dropdown
  static async getAmenities(req, res) {
    try {
      const amenities = await RoomModel.getAmenities();
      res.json({
        success: true,
        data: amenities
      });
    } catch (error) {
      console.error('Error fetching amenities:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching amenities',
        error: error.message
      });
    }
  }

  // Get all amenities for dropdown
  static async getAllAmenities(req, res) {
    try {
      const amenities = await RoomModel.getAllAmenities();
      res.json({
        success: true,
        data: amenities
      });
    } catch (error) {
      console.error('Error fetching all amenities:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching all amenities',
        error: error.message
      });
    }
  }

  // Get seasons for seasonal pricing
  static async getSeasons(req, res) {
    try {
      const seasons = await RoomModel.getSeasons();
      res.json(seasons);
    } catch (error) {
      console.error('Error fetching seasons:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching seasons',
        error: error.message
      });
    }
  }

  // ========================================
  // API ROUTES - SEASON CRUD
  // ========================================
  
  // Get all seasons
  static async getAllSeasons(req, res) {
    try {
      const seasons = await RoomModel.getAllSeasons();
      res.json({
        success: true,
        data: seasons
      });
    } catch (error) {
      console.error('Error fetching seasons:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching seasons',
        error: error.message
      });
    }
  }

  // Get season by ID
  static async getSeasonById(req, res) {
    try {
      const { id } = req.params;
      const season = await RoomModel.getSeasonById(id);
      
      if (season) {
        res.json({
          success: true,
          data: season
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Season not found'
        });
      }
    } catch (error) {
      console.error('Error fetching season:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching season',
        error: error.message
      });
    }
  }

  // Create season
  static async createSeason(req, res) {
    try {
      const { NAME, START_DATE, END_DATE, ACTIVE } = req.body;
      const encodedBy = req.user ? req.user.userId : null;

      if (!encodedBy) {
        return res.status(400).json({ 
          success: false, 
          message: 'User is not logged in' 
        });
      }

      const result = await RoomModel.createSeason(NAME, START_DATE, END_DATE, ACTIVE, encodedBy);

      res.json({
        success: true,
        message: 'Season created successfully',
        data: { id: result }
      });
    } catch (error) {
      console.error('Error creating season:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating season',
        error: error.message
      });
    }
  }

  // Update season
  static async updateSeason(req, res) {
    try {
      const { IDNo, NAME, START_DATE, END_DATE, ACTIVE } = req.body;
      const encodedBy = req.user ? req.user.userId : null;

      if (!encodedBy) {
        return res.status(400).json({ 
          success: false, 
          message: 'User is not logged in' 
        });
      }

      const result = await RoomModel.updateSeason(IDNo, NAME, START_DATE, END_DATE, ACTIVE, encodedBy);

      if (result) {
        res.json({
          success: true,
          message: 'Season updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Season not found'
        });
      }
    } catch (error) {
      console.error('Error updating season:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating season',
        error: error.message
      });
    }
  }

  // ========================================
  // ROOM CONTROL FUNCTIONALITY
  // ========================================

  // Get room control status by room number
  static async getRoomControlStatus(req, res) {
    try {
      const { roomNumber } = req.params;
      
      if (!roomNumber) {
        return res.status(400).json({
          success: false,
          message: 'Room number is required'
        });
      }

      const room = await RoomModel.getRoomByNumber(roomNumber);
      
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }

      // Get current booking for this room
      const currentBooking = await RoomModel.getCurrentBookingByRoom(roomNumber);
      
      const roomControlData = {
        roomId: room.IDNo,
        roomNumber: room.ROOM_NUMBER,
        roomType: room.ROOM_TYPE_NAME,
        roomStatus: room.ROOM_STATUS,
        maintenanceStatus: room.ROOM_MAINTENANCE_STATUS,
        currentGuest: currentBooking ? currentBooking.CUSTOMER_NAME : null,
        checkInDate: currentBooking ? currentBooking.CHECK_IN_DATE : null,
        checkOutDate: currentBooking ? currentBooking.CHECK_OUT_DATE : null,
        isOccupied: room.ROOM_STATUS === 'Occupied',
        isMaintenance: room.ROOM_MAINTENANCE_STATUS === 'Under Maintenance',
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: roomControlData
      });
    } catch (error) {
      console.error('Error fetching room control status:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching room control status',
        error: error.message
      });
    }
  }

  // Update room control settings (Do Not Disturb, Cleaning, etc.)
  static async updateRoomControlSettings(req, res) {
    try {
      const { roomNumber, settings } = req.body;
      
      if (!roomNumber || !settings) {
        return res.status(400).json({
          success: false,
          message: 'Room number and settings are required'
        });
      }

      const { doNotDisturb, cleaning, mood, curtain, sound, ac, light } = settings;
      
      // Update room control settings in database
      const result = await RoomModel.updateRoomControlSettings(roomNumber, {
        doNotDisturb: doNotDisturb || false,
        cleaning: cleaning || false,
        mood: mood || null,
        curtain: curtain || null,
        sound: sound || null,
        ac: ac || null,
        light: light || null,
        lastUpdated: new Date().toISOString()
      });

      if (result) {
        res.json({
          success: true,
          message: 'Room control settings updated successfully',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to update room control settings'
        });
      }
    } catch (error) {
      console.error('Error updating room control settings:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating room control settings',
        error: error.message
      });
    }
  }

  // Get room control history
  static async getRoomControlHistory(req, res) {
    try {
      const { roomNumber, limit = 50 } = req.query;
      
      if (!roomNumber) {
        return res.status(400).json({
          success: false,
          message: 'Room number is required'
        });
      }

      const history = await RoomModel.getRoomControlHistory(roomNumber, parseInt(limit));
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching room control history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching room control history',
        error: error.message
      });
    }
  }

  // Emergency room control (override all settings)
  static async emergencyRoomControl(req, res) {
    try {
      const { roomNumber, action, reason } = req.body;
      
      if (!roomNumber || !action) {
        return res.status(400).json({
          success: false,
          message: 'Room number and action are required'
        });
      }

      const result = await RoomModel.emergencyRoomControl(roomNumber, action, reason);
      
      if (result) {
        res.json({
          success: true,
          message: `Emergency ${action} activated for room ${roomNumber}`,
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to activate emergency control'
        });
      }
    } catch (error) {
      console.error('Error activating emergency room control:', error);
      res.status(500).json({
        success: false,
        message: 'Error activating emergency room control',
        error: error.message
      });
    }
  }

  // ========================================
  // HOME ASSISTANT INTEGRATION METHODS
  // ========================================

  // Toggle cleaning relay (switch.relay_1)
  static async toggleCleaning(req, res) {
    try {
      const axios = require('axios');
      
      const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
      const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxZWNmMDhkNTU5MDA0YzUyYmRiNmU0YTRmY2ZjMzJlNSIsImlhdCI6MTc1OTQ2NzM4OSwiZXhwIjoyMDc0ODI3Mzg5fQ.KbfztQqa68H6XWrkPlmvN5E45sIPHgLHg0bU-NHfwKI';
      
      const { action } = req.body;
      
      // Get current state of cleaning relay
      const currentStateResponse = await axios.get(`${HOME_ASSISTANT_URL}/api/states/switch.relay_1`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      const currentState = currentStateResponse.data.state;
      
      // Determine action to take
      let newState;
      if (action === 'ON' || action === 'turn_on') {
        newState = 'on';
      } else if (action === 'OFF' || action === 'turn_off') {
        newState = 'off';
      } else {
        // Toggle current state
        newState = currentState === 'on' ? 'off' : 'on';
      }
      
      const service = newState === 'on' ? 'turn_on' : 'turn_off';
      
      // Call Home Assistant service
      const response = await axios.post(`${HOME_ASSISTANT_URL}/api/services/switch/${service}`, {
        entity_id: 'switch.relay_1'
      }, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      if (response.status === 200) {
        // Emit socket event to notify housekeeping clients of guest action
        const io = req.app.get('io');
        if (io) {
          const socketData = {
            roomNumber: '304', // Default room with guest control - you can extend this to be dynamic
            action: newState === 'on' ? 'request_cleaning' : 'cancel_cleaning',
            newState: newState.toUpperCase(),
            totalRequests: newState === 'on' ? 1 : 0,
            timestamp: new Date().toISOString(),
            source: 'guest_control'
          };
          
          io.emit('guest-cleaning-toggle', socketData);
          console.log(`🚪 Socket.IO: Guest cleaning toggle emitted - Room 304 ${socketData.action}`);
        }

        res.json({
          success: true,
          newState: newState.toUpperCase(),
          message: `Cleaning relay ${newState.toUpperCase()}`
        });
      } else {
        throw new Error(`Failed to toggle cleaning relay`);
      }
    } catch (error) {
      console.error('Error toggling cleaning:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get cleaning relay status
  static async getCleaningStatus(req, res) {
    try {
      const axios = require('axios');
      
      const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
      const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxZWNmMDhkNTU5MDA0YzUyYmRiNmU0YTRmY2ZjMzJlNSIsImlhdCI6MTc1OTQ2NzM4OSwiZXhwIjoyMDc0ODI3Mzg5fQ.KbfztQqa68H6XWrkPlmvN5E45sIPHgLHg0bU-NHfwKI';
      
      const response = await axios.get(`${HOME_ASSISTANT_URL}/api/states/switch.relay_1`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      res.json({
        success: true,
        state: response.data.state.toUpperCase()
      });
    } catch (error) {
      console.error('Error getting cleaning status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Toggle DND relay (switch.relay_4)
  static async toggleDND(req, res) {
    try {
      const axios = require('axios');
      
      const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
      const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxZWNmMDhkNTU5MDA0YzUyYmRiNmU0YTRmY2ZjMzJlNSIsImlhdCI6MTc1OTQ2NzM4OSwiZXhwIjoyMDc0ODI3Mzg5fQ.KbfztQqa68H6XWrkPlmvN5E45sIPHgLHg0bU-NHfwKI';
      
      const { action } = req.body;
      
      // Get current state of DND relay
      const currentStateResponse = await axios.get(`${HOME_ASSISTANT_URL}/api/states/switch.relay_4`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      const currentState = currentStateResponse.data.state;
      
      // Determine action to take
      let newState;
      if (action === 'ON' || action === 'turn_on') {
        newState = 'on';
      } else if (action === 'OFF' || action === 'turn_off') {
        newState = 'off';
      } else {
        // Toggle current state
        newState = currentState === 'on' ? 'off' : 'on';
      }
      
      const service = newState === 'on' ? 'turn_on' : 'turn_off';
      
      // Call Home Assistant service
      const response = await axios.post(`${HOME_ASSISTANT_URL}/api/services/switch/${service}`, {
        entity_id: 'switch.relay_4'
      }, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      if (response.status === 200) {
        res.json({
          success: true,
          newState: newState.toUpperCase(),
          message: `DND relay ${newState.toUpperCase()}`
        });
      } else {
        throw new Error(`Failed to toggle DND relay`);
      }
    } catch (error) {
      console.error('Error toggling DND:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get DND relay status
  static async getDNDStatus(req, res) {
    try {
      const axios = require('axios');
      
      const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
      const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxZWNmMDhkNTU5MDA0YzUyYmRiNmU0YTRmY2ZjMzJlNSIsImlhdCI6MTc1OTQ2NzM4OSwiZXhwIjoyMDc0ODI3Mzg5fQ.KbfztQqa68H6XWrkPlmvN5E45sIPHgLHg0bU-NHfwKI';
      
      const response = await axios.get(`${HOME_ASSISTANT_URL}/api/states/switch.relay_4`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      res.json({
        success: true,
        state: response.data.state.toUpperCase()
      });
    } catch (error) {
      console.error('Error getting DND status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get all rooms cleaning status for housekeeping
  static async getAllRoomsCleaningStatus(req, res) {
    try {
      const axios = require('axios');
      
      const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
      const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxZWNmMDhkNTU5MDA0YzUyYmRiNmU0YTRmY2ZjMzJlNSIsImlhdCI6MTc1OTQ2NzM4OSwiZXhwIjoyMDc0ODI3Mzg5fQ.KbfztQqa68H6XWrkPlmvN5E45sIPHgLHg0bU-NHfwKI';
      
      // Check cleaning relay status (switch.relay_1)
      const cleaningResponse = await axios.get(`${HOME_ASSISTANT_URL}/api/states/switch.relay_1`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      // Check DND relay status (switch.relay_4)
      const dndResponse = await axios.get(`${HOME_ASSISTANT_URL}/api/states/switch.relay_4`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      // Prepare response data
      const cleaningStatus = cleaningResponse.data.state;
      const dndStatus = dndResponse.data.state;
      
      // Check which rooms need cleaning 
      const roomsNeedingCleaning = [];
      
      // Check if cleaning relay is ON and no DND is active
      if (cleaningStatus === 'on' && dndStatus === 'off') {
        // TODO: In future, integrate with device mapping table to get exact room ID
        // For now, return Room 304 since that's the room with the guest control app
        // Add room 304 to the list since cleaning relay is ON
        roomsNeedingCleaning.push({
          roomNumber: '304', // Room with guest control app
          needsCleaning: true,
          cleaningRequestTime: new Date().toISOString(),
          source: 'Guest Request (switch.relay_1)',
          relayStatus: cleaningStatus,
          dndStatus: dndStatus
        });
        
        console.log(`🏠 Cleaning requested detected for Room 304 - Cleaning Relay: ${cleaningStatus}, DND Relay: ${dndStatus}`);
      } else {
        console.log(`🏠 No cleaning requests - Cleaning Relay: ${cleaningStatus}, DND Relay: ${dndStatus}`);
      }
      
      res.json({
        success: true,
        data: {
          roomsNeedingCleaning,
          totalCleaningRequests: roomsNeedingCleaning.length,
          cleaningRelayStatus: cleaningStatus.toUpperCase(),
          dndRelayStatus: dndStatus.toUpperCase(),
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting all rooms cleaning status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Mark room as cleaned and turn off cleaning relay
  static async markRoomCleaned(req, res) {
    try {
      const axios = require('axios');
      
      const HOME_ASSISTANT_URL = 'http://124.105.224.223:8010';
      const HA_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxZWNmMDhkNTU5MDA0YzUyYmRiNmU0YTRmY2ZjMzJlNSIsImlhdCI6MTc1OTQ2NzM4OSwiZXhwIjoyMDc0ODI3Mzg5fQ.KbfztQqa68H6XWrkPlmvN5E45sIPHgLHg0bU-NHfwKI';
      
      const { roomNumber } = req.body;
      
      // Turn OFF cleaning relay (switch.relay_1)
      const response = await axios.post(`${HOME_ASSISTANT_URL}/api/services/switch/turn_off`, {
        entity_id: 'switch.relay_1'
      }, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` }
      });
      
      if (response.status === 200) {
        // Emit socket event to notify all housekeeping clients
        const io = req.app.get('io');
        if (io) {
          io.emit('cleaning-status-update', {
            roomNumber,
            action: 'cleaned',
            cleaningRelayStatus: 'OFF',
            totalRequests: 0,
            timestamp: new Date().toISOString()
          });
          console.log(`🔔 Socket.IO: Cleaning status update emitted for Room ${roomNumber}`);
        }

        res.json({
          success: true,
          message: `Room ${roomNumber} marked as cleaned`,
          roomNumber,
          cleaningRelayStatus: 'OFF',
          cleanedAt: new Date().toISOString()
        });
      } else {
        throw new Error(`Failed to turn off cleaning relay for room ${roomNumber}`);
      }
    } catch (error) {
      console.error('Error marking room as cleaned:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

}

module.exports = RoomController; 