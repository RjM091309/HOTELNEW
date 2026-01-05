// ========================================
// VEHICLE CONTROLLER
// ========================================

const VehicleModel = require('../models/vehicleModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/vehicle';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'vehicle-' + uniqueSuffix + path.extname(file.originalname));
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
}).single('vehiclePhoto');

class VehicleController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Main vehicle management page
  static async getVehicleManagement(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('vehicle/vehicle-management', {
        title: 'Vehicle Management',
        subTitle: 'Vehicle Management',
        page: 'vehicle-management',
        activePage: 'vehicle',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });

    } catch (error) {
      console.error('Error loading vehicle management:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // ========================================
  // API ROUTES - VEHICLE CRUD
  // ========================================
  
  // Get all vehicles
  static async getAllVehicles(req, res) {
    try {
      const vehicles = await VehicleModel.getAllVehicles();
      res.json({
        success: true,
        data: vehicles
      });
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching vehicles',
        error: error.message
      });
    }
  }

  // Get vehicle by ID
  static async getVehicleById(req, res) {
    try {
      const { id } = req.params;
      const vehicle = await VehicleModel.getVehicleById(id);
      
      if (vehicle) {
        res.json({
          success: true,
          data: vehicle
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }
    } catch (error) {
      console.error('Error fetching vehicle:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching vehicle',
        error: error.message
      });
    }
  }

  // Create new vehicle
  static async createVehicle(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { modelName, vehicleType, color, plateNumber, fuelType, remarks, gpsDeviceId } = req.body;
        
        if (!modelName || !vehicleType || !color || !plateNumber || !fuelType) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Get image filename if uploaded
        const vehiclePhoto = req.file ? req.file.filename : 'car-default.jpeg';

        const vehicleData = {
          modelName,
          vehicleType,
          color,
          plateNumber,
          fuelType,
          remarks,
          gpsDeviceId: gpsDeviceId || null,
          vehiclePhoto,
          encodedBy: req.user ? req.user.userId : req.session.userId
        };

        const result = await VehicleModel.createVehicle(vehicleData);
        
        if (result) {
          res.json({
            success: true,
            message: 'Vehicle created successfully',
            data: { id: result.insertId }
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Failed to create vehicle'
          });
        }
      } catch (error) {
        console.error('Error creating vehicle:', error);
        res.status(500).json({
          success: false,
          message: 'Error creating vehicle',
          error: error.message
        });
      }
    });
  }

  // Update vehicle
  static async updateVehicle(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { vehicleId, modelName, vehicleType, color, plateNumber, fuelType, remarks, gpsDeviceId } = req.body;
        
        if (!vehicleId || !modelName || !vehicleType || !color || !plateNumber || !fuelType) {
          return res.status(400).json({
            success: false,
            message: 'Vehicle ID and all required fields must be provided'
          });
        }

        // Get existing vehicle to check if GPS Device ID changed
        const existingVehicle = await VehicleModel.getVehicleById(vehicleId);
        if (!existingVehicle) {
          return res.status(404).json({
            success: false,
            message: 'Vehicle not found'
          });
        }

        const oldGpsDeviceId = existingVehicle.GPS_DEVICE_ID || null;
        const newGpsDeviceId = gpsDeviceId || null;
        const gpsDeviceIdChanged = oldGpsDeviceId !== newGpsDeviceId;

        // Get image filename if uploaded
        const newPhoto = req.file ? req.file.filename : null;

        let vehiclePhoto = newPhoto;
        
        // If no new photo uploaded, use existing photo
        if (!newPhoto) {
          vehiclePhoto = existingVehicle.VEHICLE_PHOTO || 'car-default.jpeg';
        }

        const vehicleData = {
          vehicleId,
          modelName,
          vehicleType,
          color,
          plateNumber,
          fuelType,
          remarks,
          gpsDeviceId: newGpsDeviceId,
          vehiclePhoto,
          editedBy: req.user ? req.user.userId : req.session.userId
        };

        const result = await VehicleModel.updateVehicle(vehicleData);
        
        if (result) {
          // Emit Socket.IO event to notify monitoring pages about vehicle update
          const io = req.app.get('io');
          if (io) {
            // Convert vehicleId to string for consistency
            const vehicleIdStr = String(vehicleId);
            
            // Emit general vehicle update event
            const updateEvent = {
              vehicleId: vehicleIdStr,
              gpsDeviceIdChanged: gpsDeviceIdChanged,
              oldGpsDeviceId: oldGpsDeviceId,
              newGpsDeviceId: newGpsDeviceId,
              timestamp: new Date().toISOString()
            };
            
            console.log(`📍 Emitting vehicle-updated event:`, updateEvent);
            io.emit('vehicle-updated', updateEvent);
            
            // If GPS Device ID changed, emit specific event
            if (gpsDeviceIdChanged) {
              console.log(`📍 Vehicle ${vehicleIdStr} GPS Device ID changed: ${oldGpsDeviceId} → ${newGpsDeviceId}`);
              const gpsChangeEvent = {
                vehicleId: vehicleIdStr,
                oldGpsDeviceId: oldGpsDeviceId,
                newGpsDeviceId: newGpsDeviceId,
                timestamp: new Date().toISOString()
              };
              console.log(`📍 Emitting vehicle-gps-device-changed event:`, gpsChangeEvent);
              io.emit('vehicle-gps-device-changed', gpsChangeEvent);
            }
          } else {
            console.warn('⚠️ Socket.IO not available - cannot emit vehicle update event');
          }
          
          res.json({
            success: true,
            message: 'Vehicle updated successfully'
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'Vehicle not found'
          });
        }
      } catch (error) {
        console.error('Error updating vehicle:', error);
        res.status(500).json({
          success: false,
          message: 'Error updating vehicle',
          error: error.message
        });
      }
    });
  }

  // Delete vehicle
  static async deleteVehicle(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await VehicleModel.deleteVehicle(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Vehicle deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting vehicle',
        error: error.message
      });
    }
  }

}

module.exports = VehicleController; 