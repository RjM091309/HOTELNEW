// ========================================
// GPS TRACKER CONTROLLER
// ========================================

const GpsTrackerModel = require('../models/gpsTrackerModel');
const MapsController = require('./c_maps');
const querystring = require('querystring');

class GpsTrackerController {
  
  // ========================================
  // GPS TRACKER ENDPOINT (Public - GPS device sends data here)
  // ========================================
  
  // POST /api/gps-tracker/location
  // This endpoint receives data from the GPS tracker device
  static async receiveLocation(req, res) {
    try {
      let data = {};
      const bodyText = typeof req.body === 'string' ? req.body : (req.body ? JSON.stringify(req.body) : '');
      
      console.log(`📍 Raw GPS data received: ${bodyText.substring(0, 200)}`);
      
      // ST-903 ay maaaring mag-send sa iba't ibang format
      // Try JSON first
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        try {
          data = typeof req.body === 'object' ? req.body : JSON.parse(bodyText);
        } catch (e) {
          console.error('JSON parse error:', e);
        }
      }
      
      // If JSON parsing didn't work or data is empty, try text formats
      if (!data.deviceId && !data.IMEI && !data.imei) {
        // Try Sinotrack ST903 format: *HQ,IMEI,lat,lng,speed,heading,date,time#
        // Format: *HQ,7026270832,14.5994,121.0333,0,0,240101,120000#
        const st903Match = bodyText.match(/\*(HQ|ST),(\d+),([\d.\-]+),([\d.\-]+),?([\d.]*),?([\d.]*),?(\d{6})?,?(\d{6})?#?/);
        if (st903Match) {
          const [, command, imei, lat, lng, speed, heading, date, time] = st903Match;
          let timestamp = new Date();
          
          // Parse date and time if provided (format: YYMMDD and HHMMSS)
          if (date && time) {
            const year = 2000 + parseInt(date.substring(0, 2));
            const month = parseInt(date.substring(2, 4)) - 1; // Month is 0-indexed
            const day = parseInt(date.substring(4, 6));
            const hour = parseInt(time.substring(0, 2));
            const minute = parseInt(time.substring(2, 4));
            const second = parseInt(time.substring(4, 6));
            timestamp = new Date(year, month, day, hour, minute, second);
          }
          
          data = {
            deviceId: imei,
            latitude: lat,
            longitude: lng,
            speed: speed || null,
            heading: heading || null,
            timestamp: timestamp
          };
          console.log(`✅ Parsed ST903 format: Device ${imei} at (${lat}, ${lng})`);
        } else {
          // Try URL-encoded
          try {
            const parsed = querystring.parse(bodyText);
            if (parsed.IMEI || parsed.imei || parsed.deviceId) {
              data = parsed;
            }
          } catch (e) {
            // Continue to next format
          }
          
          // Try custom format (e.g., *IMEI,lat,lng#)
          if (!data.deviceId && !data.IMEI) {
            const customMatch = bodyText.match(/\*(\d+),([\d.\-]+),([\d.\-]+),?([\d.]*),?([\d.]*),?([\d]*)#?/);
            if (customMatch) {
              const [, deviceId, lat, lng, speed, heading, timestamp] = customMatch;
              data = {
                deviceId: deviceId,
                latitude: lat,
                longitude: lng,
                speed: speed || null,
                heading: heading || null,
                timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date()
              };
            } else {
              // Try simple comma-separated format
              const parts = bodyText.split(',');
              if (parts.length >= 3) {
                // Remove * and # if present
                const cleanParts = parts.map(p => p.replace(/^[\*#]+|[\*#]+$/g, '').trim());
                data = {
                  deviceId: cleanParts[0],
                  latitude: cleanParts[1],
                  longitude: cleanParts[2],
                  speed: cleanParts[3] || null,
                  heading: cleanParts[4] || null
                };
              }
            }
          }
        }
      }
      
      // Normalize field names (handle different variations)
      const deviceId = data.deviceId || data.IMEI || data.imei || data.device_id || data.id;
      const latitude = data.latitude || data.lat || data.LAT;
      const longitude = data.longitude || data.lng || data.lon || data.LNG || data.LON;
      const speed = data.speed || data.SPEED || data.spd;
      const heading = data.heading || data.HEADING || data.dir || data.direction;
      const timestamp = data.timestamp || data.time || data.TIMESTAMP;
      const battery = data.battery || data.BATTERY || data.bat;
      
      // Validate required fields
      if (!deviceId || !latitude || !longitude) {
        console.error('Missing required fields:', { deviceId, latitude, longitude });
        return res.status(400).send('INVALID');
      }
      
      // Validate coordinates
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.error('Invalid coordinates:', { lat, lng });
        return res.status(400).send('INVALID');
      }
      
      // Prepare location data
      const locationData = {
        deviceId: String(deviceId),
        latitude: lat,
        longitude: lng,
        speed: speed ? parseFloat(speed) : null,
        heading: heading ? parseFloat(heading) : null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        battery: battery ? parseFloat(battery) : null
      };
      
      // Store in database
      const result = await GpsTrackerModel.createLocation(locationData);
      
      // Get io instance from app
      const io = req.app.get('io');
      if (io) {
        // Broadcast location update via Socket.IO
        io.emit('driver-location-updated', {
          deviceId: locationData.deviceId,
          location: {
            lat: locationData.latitude,
            lng: locationData.longitude,
            speed: locationData.speed,
            heading: locationData.heading,
            battery: locationData.battery,
            timestamp: locationData.timestamp
          }
        });
      }
      
      console.log(`📍 GPS Location received: Device ${deviceId} at (${lat}, ${lng})`);
      
      // ST-903 expects "OK" response
      res.status(200).send('OK');
    } catch (error) {
      console.error('GPS Tracker Error:', error);
      res.status(500).send('ERROR');
    }
  }

  // ========================================
  // API ENDPOINTS (For App/Web)
  // ========================================
  
  // GET /api/driver/location/:deviceId
  // Get latest location for a specific device
  static async getLocation(req, res) {
    try {
      const { deviceId } = req.params;
      
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          message: 'Device ID is required'
        });
      }
      
      const location = await GpsTrackerModel.getLatestLocation(deviceId);
      
      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found for this device'
        });
      }
      
      const locationData = {
        deviceId: location.device_id,
        lat: location.latitude,
        lng: location.longitude,
        speed: location.speed,
        heading: location.heading,
        timestamp: location.timestamp,
        battery: location.battery,
        createdAt: location.created_at
      };
      
      // Optional: Get address from coordinates using Maps controller
      const includeAddress = req.query.includeAddress === 'true';
      if (includeAddress) {
        try {
          // Create a mock response object for MapsController
          let addressResult = null;
          const mockRes = {
            status: (code) => ({
              json: (data) => {
                addressResult = data;
                return data;
              }
            }),
            json: (data) => {
              addressResult = data;
              return data;
            }
          };
          
          await MapsController.reverseGeocode({
            query: { lat: location.latitude.toString(), lng: location.longitude.toString() }
          }, mockRes);
          
          if (addressResult && addressResult.success) {
            locationData.address = addressResult.data.address;
            locationData.placeId = addressResult.data.placeId;
          }
        } catch (error) {
          console.error('Reverse geocoding error:', error);
          // Continue without address if geocoding fails
        }
      }
      
      res.json({
        success: true,
        data: locationData
      });
    } catch (error) {
      console.error('Get Location Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get location',
        error: error.message
      });
    }
  }

  // GET /api/gps-tracker/history/:deviceId
  // Get location history for a device
  static async getLocationHistory(req, res) {
    try {
      const { deviceId } = req.params;
      const limit = parseInt(req.query.limit) || 100;
      
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          message: 'Device ID is required'
        });
      }
      
      const locations = await GpsTrackerModel.getLocationHistory(deviceId, limit);
      
      // Optional: Get addresses for locations
      const includeAddress = req.query.includeAddress === 'true';
      const locationData = await Promise.all(
        locations.map(async (loc) => {
          const data = {
            id: loc.id,
            deviceId: loc.device_id,
            lat: loc.latitude,
            lng: loc.longitude,
            speed: loc.speed,
            heading: loc.heading,
            timestamp: loc.timestamp,
            battery: loc.battery,
            createdAt: loc.created_at
          };
          
          if (includeAddress) {
            try {
              // Create a mock response object for MapsController
              let addressResult = null;
              const mockRes = {
                status: (code) => ({
                  json: (data) => {
                    addressResult = data;
                    return data;
                  }
                }),
                json: (data) => {
                  addressResult = data;
                  return data;
                }
              };
              
              await MapsController.reverseGeocode({
                query: { lat: loc.latitude.toString(), lng: loc.longitude.toString() }
              }, mockRes);
              
              if (addressResult && addressResult.success) {
                data.address = addressResult.data.address;
                data.placeId = addressResult.data.placeId;
              }
            } catch (error) {
              // Continue without address if geocoding fails
            }
          }
          
          return data;
        })
      );
      
      res.json({
        success: true,
        data: locationData
      });
    } catch (error) {
      console.error('Get Location History Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get location history',
        error: error.message
      });
    }
  }

  // GET /api/gps-tracker/devices
  // Get all active devices
  static async getActiveDevices(req, res) {
    try {
      const hoursAgo = parseInt(req.query.hours) || 24;
      const devices = await GpsTrackerModel.getActiveDevices(hoursAgo);
      
      res.json({
        success: true,
        data: devices.map(device => ({
          deviceId: device.device_id,
          lastUpdate: device.last_update,
          lastCreated: device.last_created,
          totalUpdates: device.total_updates
        }))
      });
    } catch (error) {
      console.error('Get Active Devices Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active devices',
        error: error.message
      });
    }
  }

}

module.exports = GpsTrackerController;

