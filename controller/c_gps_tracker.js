// ========================================
// GPS TRACKER CONTROLLER
// ========================================

const GpsTrackerModel = require('../models/gpsTrackerModel');
const MapsController = require('./c_maps');
const querystring = require('querystring');
const { forwardToSinotrack } = require('../services/gpsForwarder');

// Calculate distance between two coordinates using Haversine formula (in meters)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

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
      
      // Try to extract satellite count from data if available
      const satelliteCount = data.satelliteCount || data.satellite_count || data.satellites || data.sat || null;
      
      // Prepare location data
      const locationData = {
        deviceId: String(deviceId),
        latitude: lat,
        longitude: lng,
        speed: speed ? parseFloat(speed) : null,
        heading: heading ? parseFloat(heading) : null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        battery: battery ? parseFloat(battery) : null,
        satelliteCount: satelliteCount ? parseInt(satelliteCount) : null
      };
      
      // Check if location has changed significantly before saving
      // Get distance threshold from environment variable (default: 10 meters)
      const distanceThreshold = parseFloat(process.env.GPS_MIN_DISTANCE_METERS || '10');
      
      const latestLocation = await GpsTrackerModel.getLatestLocation(locationData.deviceId);
      let shouldSave = true;
      let distanceMeters = 0;
      
      if (latestLocation) {
        // Round coordinates to 6 decimal places (~0.1m precision) to avoid floating point issues
        const roundCoord = (coord) => Math.round(parseFloat(coord) * 1000000) / 1000000;
        const roundedLatestLat = roundCoord(latestLocation.latitude);
        const roundedLatestLng = roundCoord(latestLocation.longitude);
        const roundedNewLat = roundCoord(lat);
        const roundedNewLng = roundCoord(lng);
        
        // Check if timestamp is the same (indicates duplicate message from GPS device)
        const latestTimestamp = latestLocation.timestamp ? new Date(latestLocation.timestamp).getTime() : null;
        const newTimestamp = locationData.timestamp ? new Date(locationData.timestamp).getTime() : null;
        
        // First check: Same timestamp AND same coordinates = duplicate message
        if (latestTimestamp && newTimestamp && latestTimestamp === newTimestamp) {
          if (roundedLatestLat === roundedNewLat && roundedLatestLng === roundedNewLng) {
            shouldSave = false;
            console.log(`⏭️ Location not saved: Device ${locationData.deviceId} - duplicate message (same timestamp and coordinates)`);
          }
        }
        
        // Second check: Are coordinates exactly the same (within 0.1m precision)?
        // This catches exact duplicates even if distance calculation has issues
        if (shouldSave && roundedLatestLat === roundedNewLat && roundedLatestLng === roundedNewLng) {
          shouldSave = false;
          console.log(`⏭️ Location not saved: Device ${locationData.deviceId} - exact same coordinates (${roundedNewLat}, ${roundedNewLng})`);
        } else if (shouldSave) {
          // Third check: Calculate distance using rounded coordinates
          distanceMeters = calculateDistance(
            roundedLatestLat,
            roundedLatestLng,
            roundedNewLat,
            roundedNewLng
          );
          
          if (distanceMeters < distanceThreshold) {
            shouldSave = false;
            // Don't save duplicate location, but still forward and emit Socket.IO
            console.log(`⏭️ Location not saved: Device ${locationData.deviceId} moved only ${distanceMeters.toFixed(2)}m (threshold: ${distanceThreshold}m)`);
          } else {
            console.log(`📍 Location changed: Device ${locationData.deviceId} moved ${distanceMeters.toFixed(2)}m (threshold: ${distanceThreshold}m)`);
          }
        }
      }
      
      // Store in database only if location changed significantly
      let savedLocation = null;
      if (shouldSave) {
        savedLocation = await GpsTrackerModel.createLocation(locationData);
        console.log(`📍 GPS Location saved: Device ${deviceId} at (${lat}, ${lng})`);
        
        // Only broadcast via Socket.IO AFTER saving to database
        // Get the saved location from database to ensure we emit database data, not GPS device data
        const dbLocation = await GpsTrackerModel.getLatestLocation(locationData.deviceId);
        if (dbLocation) {
          const io = req.app.get('io');
          if (io) {
            io.emit('driver-location-updated', {
              deviceId: dbLocation.device_id,
              location: {
                lat: parseFloat(dbLocation.latitude),
                lng: parseFloat(dbLocation.longitude),
                speed: dbLocation.speed ? parseFloat(dbLocation.speed) : null,
                heading: dbLocation.heading ? parseFloat(dbLocation.heading) : null,
                battery: dbLocation.battery ? parseFloat(dbLocation.battery) : null,
                timestamp: dbLocation.timestamp
              }
            });
          }
        }
      } else {
        console.log(`⏭️ GPS Location received (not saved - no movement): Device ${deviceId} at (${lat}, ${lng})`);
        // DO NOT emit Socket.IO if location not saved - all functions should depend on database
        // DO NOT update created_at timestamp - it should only update when actual new location is saved
        // The created_at represents "last time actual movement was saved", not "last time data was received"
        // BUT update timestamp, battery, satellite count, and GSM signal even when location doesn't change
        // This ensures device status fields are always up-to-date
        try {
          await GpsTrackerModel.updateDeviceStatus(
            locationData.deviceId, 
            locationData.battery, 
            locationData.satelliteCount, 
            locationData.gsmSignal, 
            locationData.timestamp
          );
          console.log(`⏭️ Updated device status for device ${deviceId} - Battery: ${locationData.battery || 'N/A'}, Satellites: ${locationData.satelliteCount || 'N/A'}, GSM: ${locationData.gsmSignal || 'N/A'}`);
        } catch (error) {
          console.error(`⚠️ Error updating device status for device ${deviceId}:`, error);
        }
      }
      
      // ST-903 expects "OK" response - Send FIRST
      res.status(200).send('OK');
      
      // Forward to pro.sinotrack.com (if configured) - NON-BLOCKING
      // Don't await - let it run in background so it doesn't delay the response
      forwardToSinotrack(bodyText, locationData).catch(error => {
        // Error already logged in forwardToSinotrack, just catch to prevent unhandled rejection
        console.error('⚠️ Forwarding error (non-blocking):', error.message);
      });
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

