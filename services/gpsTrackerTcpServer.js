// ========================================
// GPS TRACKER TCP SOCKET SERVER (Optional)
// ========================================
// This is an alternative to HTTP POST endpoint
// Some GPS trackers prefer TCP socket connection
// To use this, uncomment the initialization in app.js

const net = require('net');
const GpsTrackerModel = require('../models/gpsTrackerModel');

let tcpServer = null;

function startGpsTrackerTcpServer(io, port = 8090) {
  if (tcpServer) {
    console.log('⚠️ GPS Tracker TCP Server is already running');
    return tcpServer;
  }

  tcpServer = net.createServer((socket) => {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`📍 GPS Tracker TCP connection from: ${clientAddress}`);
    
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
    console.log(`📍 GPS Tracker TCP Server listening on port ${port}`);
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
    console.log(`📍 Received GPS data: ${message}`);
    
    // Parse ST-903 data format
    // Format: *HQ,IMEI,lat,lng,speed,heading,date,time#
    // Or: *ST,IMEI,lat,lng,speed,heading,date,time#
    // Or: *IMEI,lat,lng,speed,heading,timestamp#
    // Or: IMEI,lat,lng,speed,heading
    let data = {};
    
    // Try Sinotrack ST903 format first: *HQ,IMEI,lat,lng,speed,heading,date,time#
    // Format: *HQ,7026270832,14.5994,121.0333,0,0,240101,120000#
    const st903Match = message.match(/\*(HQ|ST),(\d+),([\d.\-]+),([\d.\-]+),?([\d.]*),?([\d.]*),?(\d{6})?,?(\d{6})?#?/);
    
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
    
    // Validate
    if (!data.deviceId || !data.latitude || !data.longitude) {
      throw new Error('Missing required fields');
    }
    
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Invalid coordinates');
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
    
    console.log(`📍 GPS Location saved: Device ${locationData.deviceId} at (${lat}, ${lng})`);
    
    // Send acknowledgment
    socket.write('OK\r\n');
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

