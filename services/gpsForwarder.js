// ========================================
// GPS DATA FORWARDER TO PRO.SINOTRACK.COM
// ========================================
// This service forwards GPS data to pro.sinotrack.com
// while keeping the data in the hotel system

const net = require('net');
const http = require('http');
const https = require('https');

// Forward GPS data to pro.sinotrack.com
async function forwardToSinotrack(originalMessage, locationData) {
  try {
    // Check if forwarding is enabled
    const forwardEnabled = process.env.FORWARD_TO_SINOTRACK === 'true' || process.env.FORWARD_TO_SINOTRACK === '1';
    if (!forwardEnabled) {
      return; // Forwarding disabled
    }

    const sinotrackHost = process.env.SINOTRACK_HOST || 'pro.sinotrack.com';
    const sinotrackPort = parseInt(process.env.SINOTRACK_PORT || '8090');
    const sinotrackProtocol = process.env.SINOTRACK_PROTOCOL || 'tcp'; // 'tcp' or 'http' or 'https'

    if (sinotrackProtocol === 'tcp') {
      // Forward via TCP connection
      await forwardViaTcp(sinotrackHost, sinotrackPort, originalMessage);
    } else if (sinotrackProtocol === 'http' || sinotrackProtocol === 'https') {
      // Forward via HTTP/HTTPS
      await forwardViaHttp(sinotrackHost, sinotrackPort, sinotrackProtocol, locationData, originalMessage);
    }
  } catch (error) {
    // Don't fail the main process if forwarding fails
    console.error('⚠️ Error forwarding to Sinotrack:', error.message);
  }
}

// Forward GPS data via TCP to Sinotrack
async function forwardViaTcp(host, port, message) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        reject(new Error('TCP connection timeout'));
      }
    }, 5000); // 5 second timeout

    client.connect(port, host, () => {
      console.log(`📤 Forwarding GPS data to ${host}:${port} via TCP`);
      
      // Send the original message
      client.write(message + '\r\n');
      
      // Wait for response (if any)
      client.once('data', (data) => {
        console.log(`✅ Sinotrack TCP response: ${data.toString().trim()}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          client.destroy();
          resolve();
        }
      });

      // If no response, close after a short delay
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          client.destroy();
          resolve();
        }
      }, 1000);
    });

    client.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.error(`❌ Sinotrack TCP connection error: ${error.message}`);
        reject(error);
      }
    });

    client.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

// Forward GPS data via HTTP/HTTPS to Sinotrack
async function forwardViaHttp(host, port, protocol, locationData, originalMessage) {
  return new Promise((resolve, reject) => {
    const isHttps = protocol === 'https';
    const httpModule = isHttps ? https : http;
    
    const path = process.env.SINOTRACK_API_PATH || '/api/gps/location';
    const url = `${protocol}://${host}${port !== (isHttps ? 443 : 80) ? `:${port}` : ''}${path}`;
    
    // Try to send original message format if available, otherwise send JSON
    let postData;
    let contentType;
    
    if (originalMessage && process.env.SINOTRACK_SEND_RAW === 'true') {
      // Send raw message format
      postData = originalMessage;
      contentType = 'text/plain';
    } else {
      // Send JSON format
      postData = JSON.stringify({
        deviceId: locationData.deviceId,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        heading: locationData.heading,
        timestamp: locationData.timestamp ? (locationData.timestamp.toISOString ? locationData.timestamp.toISOString() : locationData.timestamp) : new Date().toISOString(),
        battery: locationData.battery
      });
      contentType = 'application/json';
    }

    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    };

    console.log(`📤 Forwarding GPS data to ${url} via ${protocol.toUpperCase()}`);

    const req = httpModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`✅ Sinotrack HTTP response (${res.statusCode}): ${data}`);
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Sinotrack HTTP request error: ${error.message}`);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  forwardToSinotrack
};

