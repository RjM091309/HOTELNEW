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

// Track last save time per device for time-based throttling
// DB saving strategy: speed > 0 every 5-10 sec, speed = 0 every 30-60 sec
const deviceLastSaveTime = new Map();

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
      let lat = parseFloat(latitude);
      let lng = parseFloat(longitude);
      
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.error('Invalid coordinates:', { lat, lng });
        return res.status(400).send('INVALID');
      }
      
      // Check for swapped coordinates (Philippines: lat 4-21, lng 116-127)
      if (!(lat >= 4 && lat <= 21 && lng >= 116 && lng <= 127)) {
        // Check if coordinates might be swapped
        if (lng >= 4 && lng <= 21 && lat >= 116 && lat <= 127) {
          console.log(`🔄 WARNING: Coordinates appear to be SWAPPED! Auto-correcting: lat=${lng}, lng=${lat}`);
          const temp = lat;
          lat = lng;
          lng = temp;
          console.log(`✅ Using corrected coordinates: ${lat}, ${lng}`);
        } else {
          console.log(`⚠️ Coordinates outside Philippines range: ${lat}, ${lng} (expected: lat 4-21, lng 116-127)`);
        }
      }
      
      // Try to extract satellite count from data if available
      const satelliteCount = data.satelliteCount || data.satellite_count || data.satellites || data.sat || null;
      
      // Normalize and validate heading (0-360 degrees)
      let normalizedHeading = null;
      if (heading !== null && heading !== undefined && heading !== '') {
        normalizedHeading = parseFloat(heading);
        if (!isNaN(normalizedHeading)) {
          // Normalize heading to 0-360 range
          normalizedHeading = normalizedHeading % 360;
          if (normalizedHeading < 0) normalizedHeading += 360;
        } else {
          normalizedHeading = null;
        }
      }
      
      // Prepare location data
      const locationData = {
        deviceId: String(deviceId),
        latitude: lat,
        longitude: lng,
        speed: speed ? parseFloat(speed) : null,
        heading: normalizedHeading,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        battery: battery ? parseFloat(battery) : null,
        satelliteCount: satelliteCount ? parseInt(satelliteCount) : null
      };
      
      // Check if location has changed significantly before saving
      // Get distance threshold from environment variable (default: 30 meters to reduce jitter)
      const distanceThreshold = parseFloat(process.env.GPS_MIN_DISTANCE_METERS || '30');
      const minSpeedKph = parseFloat(process.env.GPS_MIN_SPEED_KPH || '3'); // require small speed if provided
      
      const latestLocation = await GpsTrackerModel.getLatestLocation(locationData.deviceId);
      // Derive charging flag if device didn't send explicit flag
      const deriveChargingFlag = () => {
        // Default: not charging unless explicitly inferred
        let flag = false;
        const prevBattery = latestLocation && latestLocation.battery !== null && latestLocation.battery !== undefined
          ? parseFloat(latestLocation.battery)
          : null;
        const prevFlag = latestLocation && latestLocation.is_charging !== undefined ? latestLocation.is_charging : null;

        // If device explicitly sends is_charging in payload (future-proof), honor it
        if (data.is_charging !== undefined && data.is_charging !== null) {
          return !!data.is_charging;
        }

        // If no battery reading, fall back to previous flag (if any), else false
        if (locationData.battery === null || locationData.battery === undefined || isNaN(locationData.battery)) {
          return prevFlag !== null && prevFlag !== undefined ? !!prevFlag : flag;
        }

        // If we have previous battery, compare delta
        if (prevBattery !== null && !isNaN(prevBattery)) {
          if (locationData.battery > prevBattery) return true;  // rising -> charging
          if (locationData.battery < prevBattery) return false; // dropping -> not charging
          // same level: keep previous flag if it existed
          return prevFlag !== null && prevFlag !== undefined ? !!prevFlag : flag;
        }

        // No previous battery; assume not charging
        return flag;
      };
      locationData.isCharging = deriveChargingFlag();
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
          distanceMeters = 0; // No movement
          console.log(`⏭️ Location not saved: Device ${locationData.deviceId} - exact same coordinates (${roundedNewLat}, ${roundedNewLng})`);
        } else if (shouldSave) {
          // Third check: Calculate distance using rounded coordinates
          distanceMeters = calculateDistance(
            roundedLatestLat,
            roundedLatestLng,
            roundedNewLat,
            roundedNewLng
          );
          
          const hasSpeed = locationData.speed !== null && locationData.speed !== undefined && !isNaN(locationData.speed);
          const distanceGate = hasSpeed ? distanceMeters >= distanceThreshold : distanceMeters >= distanceThreshold * 2;
          const speedGate = hasSpeed ? locationData.speed >= minSpeedKph : true;
          if (!distanceGate || !speedGate) {
            shouldSave = false;
            console.log(`⏭️ Location not saved (jitter): Device ${locationData.deviceId} - Distance: ${distanceMeters.toFixed(2)}m (threshold: ${distanceThreshold}m), Speed: ${hasSpeed ? `${locationData.speed}km/h` : 'N/A'} (threshold: ${hasSpeed ? `${minSpeedKph}km/h` : 'N/A'})`);
          } else {
            console.log(`📍 Location changed: Device ${locationData.deviceId} moved ${distanceMeters.toFixed(2)}m (threshold: ${distanceThreshold}m), Speed: ${hasSpeed ? `${locationData.speed}km/h` : 'N/A'}`);
          }
        } else if (latestLocation) {
          // Calculate distance even if not saving (for isMoving calculation)
          distanceMeters = calculateDistance(
            roundedLatestLat,
            roundedLatestLng,
            roundedNewLat,
            roundedNewLng
          );
        }
      }
      
      // Calculate isMoving status before saving to database
      // isMoving = true if: distance >= 30m AND speed > 0 AND speed >= 3 km/h
      // This ensures consistent calculation stored in database
      // Note: Calculate isMoving based on actual movement, not just whether we're saving
      const hasSpeedForMoving = locationData.speed !== null && locationData.speed !== undefined && !isNaN(locationData.speed) && locationData.speed > 0;
      const speedForMoving = hasSpeedForMoving ? parseFloat(locationData.speed) : 0;
      const MOVEMENT_DISTANCE_METERS = parseFloat(process.env.GPS_MIN_DISTANCE_METERS || '30');
      const MOVEMENT_MIN_SPEED_KPH = parseFloat(process.env.GPS_MIN_SPEED_KPH || '3');
      
      let isMoving = false;
      if (hasSpeedForMoving && speedForMoving > 0 && distanceMeters >= MOVEMENT_DISTANCE_METERS) {
        // Mark as moving if distance >= threshold AND speed >= threshold
        isMoving = speedForMoving >= MOVEMENT_MIN_SPEED_KPH;
      }
      // If distance < threshold or speed < threshold, device is not moving (standby)
      
      locationData.isMoving = isMoving;
      
      // 🗄️ Time-based DB saving throttling
      // speed > 0: every 5-10 sec, speed = 0: every 30-60 sec
      const hasSpeed = locationData.speed !== null && locationData.speed !== undefined && !isNaN(locationData.speed) && locationData.speed > 0;
      const lastSaveTime = deviceLastSaveTime.get(locationData.deviceId);
      const now = Date.now();
      const timeSinceLastSave = lastSaveTime ? now - lastSaveTime : Infinity;
      
      // Throttle: moving vehicles save every 5-10 sec, standby every 30-60 sec
      const minSaveInterval = hasSpeed ? 5000 : 30000; // 5 sec for moving, 30 sec for standby
      const shouldThrottle = lastSaveTime && timeSinceLastSave < minSaveInterval;
      
      if (shouldSave && shouldThrottle) {
        shouldSave = false;
        console.log(`⏭️ Location save throttled: Device ${locationData.deviceId} - Last save ${(timeSinceLastSave / 1000).toFixed(1)}s ago (min: ${minSaveInterval / 1000}s)`);
      }
      
      // 🔁 CORRECT FLOW: GPS Device → Socket.IO (IMMEDIATE) → Google Map → Database (history)
      // Socket.IO = live movement, Database = memory/history
      // Emit Socket.IO IMMEDIATELY from GPS data (before DB save)
      const io = req.app.get('io');
      if (io) {
        io.emit('driver-location-updated', {
          deviceId: locationData.deviceId,
          location: {
            lat: locationData.latitude,
            lng: locationData.longitude,
            speed: locationData.speed ? parseFloat(locationData.speed) : null,
            heading: locationData.heading ? parseFloat(locationData.heading) : null,
            battery: locationData.battery !== null && locationData.battery !== undefined ? parseFloat(locationData.battery) : null,
            isCharging: locationData.isCharging !== null && locationData.isCharging !== undefined ? !!locationData.isCharging : null,
            satelliteCount: locationData.satelliteCount !== null && locationData.satelliteCount !== undefined ? parseInt(locationData.satelliteCount) : null,
            gsmSignal: locationData.gsmSignal !== null && locationData.gsmSignal !== undefined ? parseInt(locationData.gsmSignal) : null,
            timestamp: locationData.timestamp
          }
        });
      }
      
      // Store in database only if location changed significantly (throttled saving)
      let savedLocation = null;
      if (shouldSave) {
        savedLocation = await GpsTrackerModel.createLocation(locationData);
        deviceLastSaveTime.set(locationData.deviceId, now); // Track save time
        console.log(`📍 GPS Location saved: Device ${deviceId} at (${lat.toFixed(6)}, ${lng.toFixed(6)}) - Battery: ${locationData.battery !== null ? locationData.battery : 'N/A'}%, Satellites: ${locationData.satelliteCount !== null ? locationData.satelliteCount : 'N/A'}, GSM: ${locationData.gsmSignal !== null ? locationData.gsmSignal : 'N/A'}, Moving: ${isMoving ? 'Yes' : 'No'}`);
      } else {
        console.log(`⏭️ GPS Location received (not saved - no movement): Device ${deviceId} at (${lat}, ${lng})`);
        // Update device status (battery, coordinates, etc.) even when not saving new location
        // IMPORTANT: Also update is_moving to false (standby) when device is not moving
        try {
          await GpsTrackerModel.updateDeviceStatus(
            locationData.deviceId, 
            locationData.battery, 
            locationData.satelliteCount, 
            locationData.gsmSignal, 
            locationData.timestamp,
            locationData.isCharging,
            locationData.latitude,
            locationData.longitude,
            isMoving // Pass isMoving=false to update database status to standby
          );
          
          console.log(`⏭️ GPS Location received (not saved - no movement): Device ${deviceId} at (${lat.toFixed(6)}, ${lng.toFixed(6)}) - Updated: Battery=${locationData.battery !== null && locationData.battery !== undefined ? locationData.battery : 'N/A'}%, Satellites=${locationData.satelliteCount !== null && locationData.satelliteCount !== undefined ? locationData.satelliteCount : 'N/A'}, GSM=${locationData.gsmSignal !== null && locationData.gsmSignal !== undefined ? locationData.gsmSignal : 'N/A'}, Charging=${locationData.isCharging ? 'Yes' : 'No'}, Status=${isMoving ? 'In Transit' : 'Standby'}`);
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

