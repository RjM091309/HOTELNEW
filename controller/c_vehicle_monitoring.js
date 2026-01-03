// ========================================
// VEHICLE MONITORING CONTROLLER
// ========================================

const VehicleModel = require('../models/vehicleModel');
const GpsTrackerModel = require('../models/gpsTrackerModel');

class VehicleMonitoringController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Vehicle monitoring page with map
  static async getVehicleMonitoring(req, res) {
    try {
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('vehicle/vehicle-monitoring', {
        title: 'Vehicle Monitoring',
        subTitle: 'Real-time Vehicle Tracking',
        page: 'vehicle-monitoring',
        activePage: 'vehicle',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });
    } catch (error) {
      console.error('Error loading vehicle monitoring:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // ========================================
  // API ENDPOINTS
  // ========================================
  
  // Get all vehicles with their latest GPS location
  static async getVehiclesWithLocation(req, res) {
    try {
      const vehicles = await VehicleModel.getVehiclesWithLocation();
      
      // Format response for map display
      const formattedVehicles = vehicles.map(vehicle => ({
        id: vehicle.IDNo,
        modelName: vehicle.MODEL_NAME,
        vehicleType: vehicle.VEHICLE_TYPE,
        color: vehicle.COLOR,
        plateNumber: vehicle.PLATE_NUMBER,
        gpsDeviceId: vehicle.GPS_DEVICE_ID,
        photo: vehicle.VEHICLE_PHOTO,
        location: vehicle.latitude && vehicle.longitude ? {
          lat: parseFloat(vehicle.latitude),
          lng: parseFloat(vehicle.longitude),
          speed: vehicle.speed ? parseFloat(vehicle.speed) : null,
          heading: vehicle.heading ? parseFloat(vehicle.heading) : null,
          battery: vehicle.battery ? parseFloat(vehicle.battery) : null,
          lastUpdate: vehicle.last_location_time,
          minutesSinceUpdate: vehicle.minutes_since_update
        } : null,
        hasGps: !!vehicle.GPS_DEVICE_ID,
        isOnline: vehicle.minutes_since_update !== null && vehicle.minutes_since_update < 10 // Online if updated within 10 minutes
      }));
      
      res.json({
        success: true,
        data: formattedVehicles
      });
    } catch (error) {
      console.error('Error fetching vehicles with location:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vehicles with location',
        error: error.message
      });
    }
  }

  // Get vehicle with location by ID
  static async getVehicleWithLocation(req, res) {
    try {
      const { id } = req.params;
      const vehicle = await VehicleModel.getVehicleWithLocationById(id);
      
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }
      
      // Format response
      const formattedVehicle = {
        id: vehicle.IDNo,
        modelName: vehicle.MODEL_NAME,
        vehicleType: vehicle.VEHICLE_TYPE,
        color: vehicle.COLOR,
        plateNumber: vehicle.PLATE_NUMBER,
        gpsDeviceId: vehicle.GPS_DEVICE_ID,
        photo: vehicle.VEHICLE_PHOTO,
        location: vehicle.latitude && vehicle.longitude ? {
          lat: parseFloat(vehicle.latitude),
          lng: parseFloat(vehicle.longitude),
          speed: vehicle.speed ? parseFloat(vehicle.speed) : null,
          heading: vehicle.heading ? parseFloat(vehicle.heading) : null,
          battery: vehicle.battery ? parseFloat(vehicle.battery) : null,
          lastUpdate: vehicle.last_location_time,
          minutesSinceUpdate: vehicle.minutes_since_update
        } : null,
        hasGps: !!vehicle.GPS_DEVICE_ID,
        isOnline: vehicle.minutes_since_update !== null && vehicle.minutes_since_update < 10
      };
      
      res.json({
        success: true,
        data: formattedVehicle
      });
    } catch (error) {
      console.error('Error fetching vehicle with location:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vehicle with location',
        error: error.message
      });
    }
  }

  // Get vehicle location history
  static async getVehicleLocationHistory(req, res) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 100;
      
      // Get vehicle to get GPS device ID
      const vehicle = await VehicleModel.getVehicleById(id);
      
      if (!vehicle) {
        return res.status(404).json({
          success: false,
          message: 'Vehicle not found'
        });
      }
      
      if (!vehicle.GPS_DEVICE_ID) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle does not have a GPS device assigned'
        });
      }
      
      // Get location history
      const locations = await GpsTrackerModel.getLocationHistory(vehicle.GPS_DEVICE_ID, limit);
      
      res.json({
        success: true,
        data: {
          vehicle: {
            id: vehicle.IDNo,
            modelName: vehicle.MODEL_NAME,
            plateNumber: vehicle.PLATE_NUMBER
          },
          locations: locations.map(loc => ({
            id: loc.id,
            lat: loc.latitude,
            lng: loc.longitude,
            speed: loc.speed,
            heading: loc.heading,
            battery: loc.battery,
            timestamp: loc.timestamp,
            createdAt: loc.created_at
          }))
        }
      });
    } catch (error) {
      console.error('Error fetching vehicle location history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vehicle location history',
        error: error.message
      });
    }
  }

  // Get all GPS devices with locations (including devices not assigned to vehicles)
  static async getAllGpsDevices(req, res) {
    try {
      const hoursParam = req.query.hours;
      const hoursAgo = hoursParam ? parseInt(hoursParam) : null;
      
      // Get all GPS devices (if hoursAgo is specified, use active devices, otherwise get all devices)
      const activeDevices = hoursAgo ? 
        await GpsTrackerModel.getActiveDevices(hoursAgo) : 
        await GpsTrackerModel.getAllDevices();
      
      // Get all vehicles to map device IDs
      const vehicles = await VehicleModel.getAllVehicles();
      const deviceToVehicle = {};
      vehicles.forEach(vehicle => {
        if (vehicle.GPS_DEVICE_ID) {
          deviceToVehicle[vehicle.GPS_DEVICE_ID] = vehicle;
        }
      });
      
      // Get latest location for each device
      const devicesWithLocation = await Promise.all(
        activeDevices.map(async (device) => {
          const location = await GpsTrackerModel.getLatestLocation(device.device_id);
          const vehicle = deviceToVehicle[device.device_id] || null;
          
          return {
            deviceId: device.device_id,
            vehicle: vehicle ? {
              id: vehicle.IDNo,
              modelName: vehicle.MODEL_NAME,
              plateNumber: vehicle.PLATE_NUMBER,
              vehicleType: vehicle.VEHICLE_TYPE,
              color: vehicle.COLOR
            } : null,
            location: location ? {
              lat: parseFloat(location.latitude),
              lng: parseFloat(location.longitude),
              speed: location.speed ? parseFloat(location.speed) : null,
              heading: location.heading ? parseFloat(location.heading) : null,
              battery: location.battery ? parseFloat(location.battery) : null,
              timestamp: location.timestamp,
              createdAt: location.created_at
            } : null,
            lastUpdate: device.last_update,
            totalUpdates: device.total_updates,
            isAssigned: !!vehicle,
            isOnline: location && location.created_at ? 
              (new Date() - new Date(location.created_at)) < 10 * 60 * 1000 : false // Online if updated within 10 minutes (use created_at - server receive time)
          };
        })
      );
      
      res.json({
        success: true,
        data: devicesWithLocation
      });
    } catch (error) {
      console.error('Error fetching all GPS devices:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch GPS devices',
        error: error.message
      });
    }
  }

}

module.exports = VehicleMonitoringController;

