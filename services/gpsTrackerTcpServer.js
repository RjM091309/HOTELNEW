// ========================================
// GPS TRACKER TCP SOCKET SERVER (Optional)
// ========================================
// This is an alternative to HTTP POST endpoint
// Some GPS trackers prefer TCP socket connection
// To use this, uncomment the initialization in app.js

const net = require('net');
const GpsTrackerModel = require('../models/gpsTrackerModel');
const { forwardToSinotrack } = require('./gpsForwarder');

let tcpServer = null;

function startGpsTrackerTcpServer(io, port = 8090) {
  if (tcpServer) {
    console.log('⚠️ GPS Tracker TCP Server is already running');
    return tcpServer;
  }

  tcpServer = net.createServer((socket) => {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    const connectionTime = new Date().toISOString();
    const logMsg = `📍 GPS Tracker TCP connection from: ${clientAddress} at ${connectionTime}`;
    console.log(logMsg);
    
    // Log when socket is ready
    socket.on('ready', () => {
      const readyMsg = `✅ Socket ready for ${clientAddress}`;
      console.log(readyMsg);
    });
    
    let buffer = '';
    
    socket.on('data', async (data) => {
      try {
        buffer += data.toString();
        
        // Process complete messages (ending with \r\n or #)
        const messages = buffer.split(/\r\n|#/);
        buffer = messages.pop() || ''; // Keep incomplete message in buffer
        
        for (const message of messages) {
          if (message.trim()) {
            await processGpsMessage(message.trim(), socket, io);
          }
        }
      } catch (error) {
        console.error('GPS Tracker TCP Error:', error);
        socket.write('ERROR\r\n');
      }
    });
    
    socket.on('error', (error) => {
      console.error(`GPS Tracker TCP Socket Error (${clientAddress}):`, error.message);
    });
    
    socket.on('close', () => {
      console.log(`📍 GPS Tracker TCP connection closed: ${clientAddress}`);
    });
  });
  
  tcpServer.listen(port, '0.0.0.0', () => {
    const logMessage = `📍 GPS Tracker TCP Server listening on port ${port} - Ready to receive GPS data`;
    console.log(logMessage);
  });
  
  tcpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ GPS Tracker TCP Server: Port ${port} is already in use`);
    } else {
      console.error('❌ GPS Tracker TCP Server Error:', error);
    }
  });
  
  return tcpServer;
}

async function processGpsMessage(message, socket, io) {
  try {
    const logMsg = `📍 Received GPS data: ${message}`;
    console.log(logMsg);
    
    // Parse ST-903 data format
    // Format: *HQ,IMEI,lat,lng,speed,heading,date,time#
    // Or: *ST,IMEI,lat,lng,speed,heading,date,time#
    // Or: *IMEI,lat,lng,speed,heading,timestamp#
    // Or: IMEI,lat,lng,speed,heading
    let data = {};
    
    // Try Sinotrack ST903 format first: *HQ,IMEI,lat,lng,speed,heading,date,time#
    // Format: *HQ,7026270832,14.5994,121.0333,0,0,240101,120000#
    // NOTE: Some devices might send lng,lat instead of lat,lng
    const st903Match = message.match(/\*(HQ|ST),(\d+),([\d.\-]+),([\d.\-]+),?([\d.]*),?([\d.]*),?(\d{6})?,?(\d{6})?#?/);
    
    if (st903Match) {
      const [, command, imei, coord1, coord2, speed, heading, date, time] = st903Match;
      let timestamp = new Date();
      
      // Determine which is lat and which is lng
      // Philippines coordinates: lat ~4-21°N, lng ~116-127°E
      // If coord1 > 90 or coord1 < -90, it's probably longitude (swapped)
      let lat, lng;
      const coord1Num = parseFloat(coord1);
      const coord2Num = parseFloat(coord2);
      
      // Check if coordinates might be swapped
      // Latitude should be between -90 and 90
      // For Philippines: lat is usually 4-21, lng is 116-127
      if (Math.abs(coord1Num) <= 90 && Math.abs(coord2Num) > 90) {
        // Normal order: lat, lng
        lat = coord1;
        lng = coord2;
        console.log(`📍 Parsing as lat,lng: ${lat}, ${lng}`);
      } else if (Math.abs(coord1Num) > 90 && Math.abs(coord2Num) <= 90) {
        // Swapped: lng, lat
        lat = coord2;
        lng = coord1;
        console.log(`⚠️ Coordinates appear swapped, using as lng,lat: ${lng}, ${lat} -> converted to lat,lng: ${lat}, ${lng}`);
      } else {
        // Assume normal order (lat, lng) if both are valid lat ranges
        lat = coord1;
        lng = coord2;
        console.log(`📍 Using coordinates as-is: ${lat}, ${lng}`);
      }
      
      // Parse date and time if provided (format: YYMMDD and HHMMSS)
      // GPS device sends time in UTC, so we need to create UTC date
      if (date && time) {
        const year = 2000 + parseInt(date.substring(0, 2));
        const month = parseInt(date.substring(2, 4)) - 1; // Month is 0-indexed
        const day = parseInt(date.substring(4, 6));
        const hour = parseInt(time.substring(0, 2));
        const minute = parseInt(time.substring(2, 4));
        const second = parseInt(time.substring(4, 6));
        // Create UTC date - GPS device sends time in UTC
        timestamp = new Date(Date.UTC(year, month, day, hour, minute, second));
      }
      
      data = {
        deviceId: imei,
        latitude: lat,
        longitude: lng,
        speed: speed || null,
        heading: heading || null,
        timestamp: timestamp
      };
      const parsedMsg = `✅ Parsed ST903 format: Device ${imei} at latitude ${lat}, longitude ${lng}`;
      console.log(parsedMsg);
    } else {
      // Try NMEA format: *HQ,IMEI,V8,HHMMSS,STATUS,DDMM.MMMM,N/S,DDDMM.MMMM,E/W,speed,heading,DDMMYY,...
      // Format: *HQ,7026270832,V8,060246,A,1511.9440,N,12031.5149,E,0.00,154,030126,...
      // Coordinates are in degrees.minutes format (DDMM.MMMM)
      const nmeaMatch = message.match(/\*(HQ|ST),(\d+),V\d+,(\d{6}),(A|V),([\d.]+),([NS]),([\d.]+),([EW]),([\d.]+),([\d.]+),(\d{6}),/);
      
      if (nmeaMatch) {
        const [, command, imei, timeStr, gpsStatus, latDm, latDir, lngDm, lngDir, speed, heading, dateStr] = nmeaMatch;
        
        // Convert NMEA format (DDMM.MMMM) to decimal degrees
        // Latitude: 1511.9440,N = 15°11.9440' = 15 + (11.9440/60) = 15.199067
        function nmeaToDecimal(nmeaCoord, direction) {
          const degrees = Math.floor(nmeaCoord / 100);
          const minutes = nmeaCoord % 100;
          let decimal = degrees + (minutes / 60);
          if (direction === 'S' || direction === 'W') {
            decimal = -decimal;
          }
          return decimal;
        }
        
        const lat = nmeaToDecimal(parseFloat(latDm), latDir);
        const lng = nmeaToDecimal(parseFloat(lngDm), lngDir);
        
        // Parse date and time
        // GPS device sends time in UTC, so we need to create UTC date
        let timestamp = new Date();
        if (dateStr && timeStr) {
          const year = 2000 + parseInt(dateStr.substring(4, 6));
          const month = parseInt(dateStr.substring(2, 4)) - 1;
          const day = parseInt(dateStr.substring(0, 2));
          const hour = parseInt(timeStr.substring(0, 2));
          const minute = parseInt(timeStr.substring(2, 4));
          const second = parseInt(timeStr.substring(4, 6));
          // Create UTC date - GPS device sends time in UTC
          timestamp = new Date(Date.UTC(year, month, day, hour, minute, second));
        }
        
        data = {
          deviceId: imei,
          latitude: lat.toString(),
          longitude: lng.toString(),
          speed: speed || null,
          heading: heading || null,
          timestamp: timestamp
        };
        
        const nmeaMsg = `✅ Parsed NMEA format: Device ${imei} at latitude ${lat.toFixed(6)}, longitude ${lng.toFixed(6)} (GPS Status: ${gpsStatus})`;
        console.log(nmeaMsg);
      } else {
        // Try custom format: *IMEI,lat,lng,speed,heading,timestamp#
      const customMatch = message.match(/\*(\d+),([\d.\-]+),([\d.\-]+),?([\d.]*),?([\d.]*),?([\d]*)#?/);
      
      if (customMatch) {
        const [, deviceId, lat, lng, speed, heading, timestamp] = customMatch;
        data = {
          deviceId,
          latitude: lat,
          longitude: lng,
          speed: speed || null,
          heading: heading || null,
          timestamp: timestamp ? new Date(parseInt(timestamp) * 1000) : new Date()
        };
      } else {
        // Try comma-separated format: IMEI,lat,lng,speed,heading
        const parts = message.split(',');
        if (parts.length >= 3) {
          // Remove * and # if present
          const cleanParts = parts.map(p => p.replace(/^[\*#]+|[\*#]+$/g, '').trim());
          data = {
            deviceId: cleanParts[0],
            latitude: cleanParts[1],
            longitude: cleanParts[2],
            speed: cleanParts[3] || null,
            heading: cleanParts[4] || null,
            timestamp: new Date()
          };
        } else {
          throw new Error('Unknown data format');
        }
      }
      }
    }
    
    // Validate
    if (!data.deviceId || !data.latitude || !data.longitude) {
      throw new Error('Missing required fields');
    }
    
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error(`❌ Invalid coordinates: lat=${lat}, lng=${lng}`);
      throw new Error('Invalid coordinates');
    }
    
    // Log coordinate validation for Philippines region
    if (lat >= 4 && lat <= 21 && lng >= 116 && lng <= 127) {
      console.log(`✅ Coordinates are within Philippines region: ${lat}, ${lng}`);
    } else {
      console.log(`⚠️ Coordinates are outside typical Philippines range: ${lat}, ${lng} (expected: lat 4-21, lng 116-127)`);
    }
    
    // Store in database
    const locationData = {
      deviceId: String(data.deviceId),
      latitude: lat,
      longitude: lng,
      speed: data.speed ? parseFloat(data.speed) : null,
      heading: data.heading ? parseFloat(data.heading) : null,
      timestamp: data.timestamp,
      battery: null
    };
    
    await GpsTrackerModel.createLocation(locationData);
    
    // Broadcast via Socket.IO
    if (io) {
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
    
    const savedMsg = `📍 GPS Location saved: Device ${locationData.deviceId} at (${lat}, ${lng})`;
    console.log(savedMsg);
    
    // Send acknowledgment FIRST (don't wait for forwarding)
    socket.write('OK\r\n');
    
    // Forward to pro.sinotrack.com (if configured) - NON-BLOCKING
    // Don't await - let it run in background so it doesn't delay the response
    forwardToSinotrack(message, locationData).catch(error => {
      // Error already logged in forwardToSinotrack, just catch to prevent unhandled rejection
      console.error('⚠️ Forwarding error (non-blocking):', error.message);
    });
  } catch (error) {
    console.error('GPS Message Processing Error:', error);
    socket.write('ERROR\r\n');
  }
}


function stopGpsTrackerTcpServer() {
  if (tcpServer) {
    tcpServer.close(() => {
      console.log('📍 GPS Tracker TCP Server stopped');
      tcpServer = null;
    });
  }
}

module.exports = {
  startGpsTrackerTcpServer,
  stopGpsTrackerTcpServer
};

