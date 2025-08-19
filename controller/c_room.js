// ========================================
// ROOM CONTROLLER
// ========================================

const RoomModel = require('../models/roomModel');
const { queryDatabasePromise } = require('../config/database');
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
      const query = 'SELECT IDNo, NAME FROM season WHERE ACTIVE = 1 ORDER BY IDNo ASC';
      const seasons = await queryDatabasePromise(query);
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
      const query = `
        SELECT 
          IDNo,
          NAME,
          START_DATE,
          END_DATE,
          ACTIVE
        FROM 
          season 
        WHERE 
          ACTIVE IN (0, 1)
        ORDER BY 
          START_DATE DESC`;
      
      const seasons = await queryDatabasePromise(query);
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
      const query = `
        SELECT 
          IDNo,
          NAME,
          DATE_FORMAT(START_DATE, '%Y-%m-%d') as START_DATE,
          DATE_FORMAT(END_DATE, '%Y-%m-%d') as END_DATE,
          ACTIVE
        FROM 
          season 
        WHERE 
          IDNo = ? AND ACTIVE IN (0, 1)`;
      
      const seasons = await queryDatabasePromise(query, [id]);
      
      if (seasons.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Season not found'
        });
      }
      
      res.json({
        success: true,
        data: seasons[0]
      });
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

      const query = `
        INSERT INTO season 
        (NAME, START_DATE, END_DATE, ACTIVE, ENCODED_BY, ENCODED_DT) 
        VALUES (?, ?, ?, ?, ?, NOW())`;

      const result = await queryDatabasePromise(query, [
        NAME, 
        START_DATE, 
        END_DATE, 
        ACTIVE,
        encodedBy
      ]);

      res.json({
        success: true,
        message: 'Season created successfully',
        data: { id: result.insertId }
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

      const query = `
        UPDATE season 
        SET 
          NAME = ?,
          START_DATE = ?,
          END_DATE = ?,
          ACTIVE = ?,
          ENCODED_BY = ?,
          ENCODED_DT = NOW()
        WHERE 
          IDNo = ?`;

      const result = await queryDatabasePromise(query, [
        NAME, 
        START_DATE, 
        END_DATE, 
        ACTIVE, 
        encodedBy,
        IDNo
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Season not found'
        });
      }

      res.json({
        success: true,
        message: 'Season updated successfully'
      });
    } catch (error) {
      console.error('Error updating season:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating season',
        error: error.message
      });
    }
  }


}

module.exports = RoomController; 