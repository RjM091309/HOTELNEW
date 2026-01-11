// ========================================
// SOCKET.IO - Vehicle Monitoring
// ========================================

import { vehicleData, previousGpsDeviceIds, gpsDevicesData } from './state.js';
import { loadVehicles } from './data-loader.js';
import { updateVehicleList } from './vehicle-list.js';
import { updateMapMarkers, animateMarkerPosition, applyMarkerRotation } from './markers.js';
import { updateTraceToggles } from './trace-toggle.js';
import { clearVehiclePath } from './markers.js';
import { markers, markerAnimations } from './state.js';
import { calculateDistanceMeters, snapToRoad } from './utils.js';

let gpsTrackingSocket = null;
let pollingInterval = null;
let isPollingActive = false;
let periodicRefreshInterval = null;

// Setup event listeners for Socket.IO
function setupSocketEventListeners() {
    if (!gpsTrackingSocket) {
        return;
    }
    
    if (!gpsTrackingSocket.connected) {
        return;
    }
    
    // Remove existing listeners to avoid duplicates
    gpsTrackingSocket.off('driver-location-updated');
    gpsTrackingSocket.off('vehicle-updated');
    gpsTrackingSocket.off('vehicle-gps-device-changed');
    
    // Listen for real-time GPS location updates
    gpsTrackingSocket.on('driver-location-updated', async (data) => {
        if (data && data.deviceId && data.location) {
            await updateVehicleLocationFromSocket(data.deviceId, data.location);
        }
    });
    
    // Listen for vehicle updates (including GPS Device ID changes)
    gpsTrackingSocket.on('vehicle-updated', async (data) => {
        if (data && data.vehicleId) {
            // Convert vehicleId to string for consistency
            const vehicleId = String(data.vehicleId);
            
            // If GPS Device ID changed, clear old location immediately
            if (data.gpsDeviceIdChanged && vehicleData[vehicleId]) {
                // Clear old path when GPS device changes
                clearVehiclePath(vehicleId);
                
                vehicleData[vehicleId].location = null;
                vehicleData[vehicleId].isOnline = false;
                vehicleData[vehicleId].gpsDeviceId = data.newGpsDeviceId;
                
                // Update UI immediately
                updateVehicleList();
                updateMapMarkers();
                updateTraceToggles(); // Update trace toggles for all devices
            }
            
            // Reload vehicles to get updated GPS Device ID and location data
            await loadVehicles();
        }
    });
    
    // Listen specifically for GPS Device ID changes
    gpsTrackingSocket.on('vehicle-gps-device-changed', async (data) => {
        if (data && data.vehicleId) {
            // Convert vehicleId to string for consistency
            const vehicleId = String(data.vehicleId);
            const oldDeviceId = data.oldGpsDeviceId;
            const newDeviceId = data.newGpsDeviceId;
            
            // Update previous GPS Device ID tracking
            previousGpsDeviceIds[vehicleId] = newDeviceId;
            
            // If vehicle exists in current data, clear old location immediately
            if (vehicleData[vehicleId]) {
                vehicleData[vehicleId].location = null;
                vehicleData[vehicleId].isOnline = false;
                vehicleData[vehicleId].gpsDeviceId = newDeviceId;
                
                // Clear old path when GPS device changes
                clearVehiclePath(vehicleId);
                
                // Remove old marker if it exists
                if (markers[vehicleId]) {
                    // Cancel animation for this marker if active
                    if (markerAnimations[vehicleId] && markerAnimations[vehicleId].animationId) {
                        cancelAnimationFrame(markerAnimations[vehicleId].animationId);
                        delete markerAnimations[vehicleId];
                    }
                    
                    markers[vehicleId].setMap(null);
                    delete markers[vehicleId];
                }
                
                // Update UI immediately
                updateVehicleList();
                updateMapMarkers();
                updateTraceToggles(); // Update trace toggles for all devices
            }
            
            // Reload vehicles to get updated GPS Device ID and location data
            await loadVehicles();
        }
    });
}

// Initialize Socket.IO connection for GPS tracking
function initGpsTrackingSocket() {
    // Check if Socket.IO is available, if not, retry after a delay
    if (typeof io === 'undefined') {
        console.error('Socket.IO library not available, retrying in 1 second...');
        setTimeout(() => {
            initGpsTrackingSocket();
        }, 1000);
        return;
    }
    
    // If already connected, just ensure listeners are set up
    if (gpsTrackingSocket && gpsTrackingSocket.connected) {
        setupSocketEventListeners();
        return;
    }
    
    try {
        // If socket exists but not connected, remove old listeners
        if (gpsTrackingSocket) {
            gpsTrackingSocket.removeAllListeners();
            gpsTrackingSocket.disconnect();
        }
        
        gpsTrackingSocket = io({
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 20000,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });
        
        gpsTrackingSocket.on('connect', () => {
            setupSocketEventListeners();
            
            // Stop polling if socket is connected
            if (isPollingActive) {
                stopPollingFallback();
            }
        });
        
        gpsTrackingSocket.on('disconnect', (reason) => {
            // Start polling fallback when disconnected
            if (!isPollingActive) {
                startPollingFallback();
            }
        });
        
        gpsTrackingSocket.on('connect_error', (error) => {
            console.error('GPS Tracking Socket.IO connection error:', error);
            // Start polling fallback on connection error
            if (!isPollingActive) {
                startPollingFallback();
            }
        });
        
        gpsTrackingSocket.on('reconnect', (attemptNumber) => {
            setupSocketEventListeners();
            // Stop polling if socket reconnected
            if (isPollingActive) {
                stopPollingFallback();
            }
        });
        
        gpsTrackingSocket.on('reconnect_failed', () => {
            console.error('GPS Tracking Socket.IO reconnection failed');
            // Start polling fallback if reconnection fails
            if (!isPollingActive) {
                startPollingFallback();
            }
        });
        
    } catch (error) {
        console.error('Error initializing GPS Tracking Socket.IO:', error);
        // Start polling fallback on error
        if (!isPollingActive) {
            startPollingFallback();
        }
        // Retry after 2 seconds
        setTimeout(() => {
            initGpsTrackingSocket();
        }, 2000);
    }
}

// Start periodic polling as fallback when Socket.IO is not available
function startPollingFallback() {
    if (isPollingActive) return;
    
    isPollingActive = true;
    
    // Poll immediately, then every 10 seconds
    loadVehicles();
    
    pollingInterval = setInterval(() => {
        loadVehicles();
    }, 10000); // Poll every 10 seconds
}

// Stop polling fallback
function stopPollingFallback() {
    if (!isPollingActive) return;
    
    isPollingActive = false;
    
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// Update vehicle location from Socket.IO event
// For smooth movement: Use Socket.IO data directly for immediate marker animation
// Then reload from database to ensure data consistency
async function updateVehicleLocationFromSocket(deviceId, locationData) {
    try {
        if (!deviceId || !locationData || !locationData.lat || !locationData.lng) {
            console.warn('📍 Invalid socket data received:', { deviceId, locationData });
            return;
        }
        
        // Find vehicle or GPS device that uses this deviceId
        let markerKey = null;
        let foundVehicle = null;
        let foundDevice = null;
        
        // Check vehicles first
        for (const [vehicleId, vehicle] of Object.entries(vehicleData)) {
            if (vehicle.gpsDeviceId === deviceId) {
                markerKey = vehicleId;
                foundVehicle = vehicle;
                break;
            }
        }
        
        // If not found in vehicles, check GPS devices
        if (!markerKey) {
            for (const [deviceIdKey, device] of Object.entries(gpsDevicesData)) {
                if (device.deviceId === deviceId) {
                    markerKey = `gps_${deviceId}`;
                    foundDevice = device;
                    break;
                }
            }
        }
        
        // Get isMoving status from Socket.IO data FIRST (before updating other data)
        // Server calculates isMoving correctly based on speed >= 3km/h AND distance >= 30m
        // Fallback to vehicle/device data if Socket.IO doesn't have it yet
        const isMovingFromSocket = locationData.isMoving !== null && locationData.isMoving !== undefined 
            ? !!locationData.isMoving 
            : (foundVehicle ? (foundVehicle.isMoving || false) : (foundDevice ? (foundDevice.isMoving || false) : false));
        
        // Snap GPS coordinates to nearest road for accurate positioning
        let newPosition = { lat: locationData.lat, lng: locationData.lng };
        
        // Only snap to road if vehicle is moving (to avoid unnecessary API calls when stationary)
        // Use the NEW isMoving status from Socket.IO for accurate decision
        if (isMovingFromSocket) {
            try {
                const snappedPosition = await snapToRoad(locationData.lat, locationData.lng);
                newPosition = snappedPosition;
            } catch (error) {
                console.warn('Failed to snap to road, using original coordinates:', error);
                // Use original coordinates if snapping fails
            }
        }
        
        // Update vehicle/device location data in memory for real-time InfoWindow updates
        // IMPORTANT: Update isMoving from Socket.IO data (server calculates it based on speed + distance)
        // Server already filters GPS jitter before calculating isMoving, so we can trust it
        if (foundVehicle && foundVehicle.location) {
            foundVehicle.location.lat = newPosition.lat;
            foundVehicle.location.lng = newPosition.lng;
            if (locationData.speed !== null && locationData.speed !== undefined) {
                foundVehicle.location.speed = parseFloat(locationData.speed);
            }
            if (locationData.heading !== null && locationData.heading !== undefined) {
                foundVehicle.location.heading = parseFloat(locationData.heading);
            }
            if (locationData.battery !== null && locationData.battery !== undefined) {
                const batteryVal = parseFloat(locationData.battery);
                // Validate and clamp battery to 0-100 range
                foundVehicle.location.battery = (!isNaN(batteryVal)) ? Math.min(100, Math.max(0, batteryVal)) : null;
            }
            if (locationData.isCharging !== null && locationData.isCharging !== undefined) {
                foundVehicle.location.isCharging = !!locationData.isCharging;
            }
            if (locationData.isMoving !== null && locationData.isMoving !== undefined) {
                // Update isMoving from Socket.IO data (server calculates it correctly based on speed + distance)
                foundVehicle.isMoving = !!locationData.isMoving;
            }
            if (locationData.satelliteCount !== null && locationData.satelliteCount !== undefined) {
                // Handle "N/A" string values - convert to null so display shows 0
                const satCountStr = String(locationData.satelliteCount).trim().toUpperCase();
                if (satCountStr === 'N/A' || satCountStr === 'NA' || satCountStr === '') {
                    foundVehicle.location.satelliteCount = null;
                } else {
                    const satCountNum = parseInt(locationData.satelliteCount);
                    foundVehicle.location.satelliteCount = isNaN(satCountNum) ? null : satCountNum;
                }
            }
            if (locationData.gsmSignal !== null && locationData.gsmSignal !== undefined) {
                foundVehicle.location.gsmSignal = parseInt(locationData.gsmSignal);
            }
            foundVehicle.location.lastUpdate = locationData.timestamp || new Date();
        } else if (foundDevice && foundDevice.location) {
            foundDevice.location.lat = newPosition.lat;
            foundDevice.location.lng = newPosition.lng;
            if (locationData.speed !== null && locationData.speed !== undefined) {
                foundDevice.location.speed = parseFloat(locationData.speed);
            }
            if (locationData.heading !== null && locationData.heading !== undefined) {
                foundDevice.location.heading = parseFloat(locationData.heading);
            }
            if (locationData.battery !== null && locationData.battery !== undefined) {
                const batteryVal = parseFloat(locationData.battery);
                // Validate and clamp battery to 0-100 range
                foundDevice.location.battery = (!isNaN(batteryVal)) ? Math.min(100, Math.max(0, batteryVal)) : null;
            }
            if (locationData.isCharging !== null && locationData.isCharging !== undefined) {
                foundDevice.location.isCharging = !!locationData.isCharging;
            }
            if (locationData.isMoving !== null && locationData.isMoving !== undefined) {
                // Update isMoving from Socket.IO data (server calculates it correctly based on speed + distance)
                foundDevice.isMoving = !!locationData.isMoving;
            }
            if (locationData.satelliteCount !== null && locationData.satelliteCount !== undefined) {
                // Handle "N/A" string values - convert to null so display shows 0
                const satCountStr = String(locationData.satelliteCount).trim().toUpperCase();
                if (satCountStr === 'N/A' || satCountStr === 'NA' || satCountStr === '') {
                    foundDevice.location.satelliteCount = null;
                } else {
                    const satCountNum = parseInt(locationData.satelliteCount);
                    foundDevice.location.satelliteCount = isNaN(satCountNum) ? null : satCountNum;
                }
            }
            if (locationData.gsmSignal !== null && locationData.gsmSignal !== undefined) {
                foundDevice.location.gsmSignal = parseInt(locationData.gsmSignal);
            }
            foundDevice.location.lastUpdate = locationData.timestamp || new Date();
        }
        
        // 🔁 CORRECT LOGIC: Update marker position based on isMoving status from Socket.IO
        // Server calculates isMoving correctly based on speed >= 3km/h AND distance >= 30m
        // If isMoving = false (standby), ignore Socket.IO position updates (GPS jitter)
        // If isMoving = true (in-transit), animate marker smoothly in real-time
        if (markerKey && markers[markerKey]) {
            const marker = markers[markerKey];
            const currentPos = marker.getPosition();
            
            // Use the isMoving status we already got from Socket.IO (calculated above)
            // Server already filtered GPS jitter before calculating isMoving
            
            // Only update marker position if actually moving (confirmed by server)
            // If standby, ignore Socket.IO position updates to prevent GPS jitter from moving marker
            if (isMovingFromSocket) {
                // IN-TRANSIT: Update marker position smoothly
                const speed = locationData.speed ? parseFloat(locationData.speed) : 0;
                
                if (currentPos) {
                    const distanceMeters = calculateDistanceMeters(
                        currentPos.lat(),
                        currentPos.lng(),
                        newPosition.lat,
                        newPosition.lng
                    );
                    
                    // 🚗 IN-TRANSIT: Animate marker smoothly (only when isMoving = true)
                    if (speed > 0 && distanceMeters >= 0.5) {
                        // Calculate duration based on speed
                        let duration = 2000; // Default 2 seconds
                        const speedMps = speed / 3.6; // km/h to m/s
                        duration = Math.min(Math.max((distanceMeters / speedMps) * 1000, 800), 3000);
                        
                        // Smoothly animate marker to new position with heading for rotation
                        animateMarkerPosition(marker, newPosition, markerKey, duration, locationData.heading);
                    } else if (distanceMeters >= 0.1) {
                        // Small movement but still in-transit - update position without animation
                        marker.setPosition(newPosition);
                        if (locationData.heading !== null && locationData.heading !== undefined) {
                            applyMarkerRotation(marker, locationData.heading);
                        }
                    }
                } else {
                    // No current position, set directly (first time)
                    marker.setPosition(newPosition);
                    if (locationData.heading !== null && locationData.heading !== undefined) {
                        applyMarkerRotation(marker, locationData.heading);
                    }
                }
            } else {
                // STANDBY: Don't update marker position (ignore GPS jitter from Socket.IO)
                // But still update heading rotation if available (for direction changes even when stationary)
                if (locationData.heading !== null && locationData.heading !== undefined) {
                    applyMarkerRotation(marker, locationData.heading);
                }
            }
            // Marker stays at last known position from database when standby
            // Other data (battery, signal, etc.) is still updated above for InfoWindow
        }
        
        // Update open InfoWindow with real-time data if it's open for this vehicle/device
        // This updates battery, signal, etc. even when marker position doesn't change (standby)
        const { updateOpenInfoWindow } = await import('./infowindow.js');
        updateOpenInfoWindow().catch(err => console.warn('InfoWindow update error:', err));
        
        // Don't reload from database immediately - Socket.IO is the source of truth for live movement
        // Database is just for history. Only reload periodically or on page refresh
    } catch (error) {
        console.error('❌ Error handling socket notification:', error);
        // On error, try to reload vehicles as fallback
        try {
            await loadVehicles();
        } catch (reloadError) {
            console.error('❌ Error reloading vehicles:', reloadError);
        }
    }
}

// Start periodic refresh (every 15 seconds as backup)
export function startPeriodicRefresh() {
    // Clear existing interval if any
    if (periodicRefreshInterval) {
        clearInterval(periodicRefreshInterval);
    }
    
    // Refresh every 15 seconds as a backup (faster detection of GPS Device ID changes)
    periodicRefreshInterval = setInterval(() => {
        // Always refresh as backup to detect GPS Device ID changes even if socket fails
        loadVehicles();
    }, 15000); // Every 15 seconds - faster detection
}

// Test socket connection and log status (for debugging)
function testSocketConnection() {
    if (gpsTrackingSocket) {
        return {
            exists: !!gpsTrackingSocket,
            connected: gpsTrackingSocket.connected,
            id: gpsTrackingSocket.id
        };
    }
    return null;
}

// Global function for testing - can be called from browser console
window.testVehicleMonitoring = async function() {
    const { vehicleData, gpsDevicesData } = await import('./state.js');
    const status = {
        socket: testSocketConnection(),
        vehicles: Object.keys(vehicleData).length,
        gpsDevices: Object.keys(gpsDevicesData).length,
        pollingActive: isPollingActive
    };
    console.log('Vehicle Monitoring Status:', status);
    return status;
};

// Test function to manually trigger vehicle update event (for testing)
window.testVehicleUpdateEvent = function(vehicleId = '38') {
    console.log('🧪 [TEST] Simulating vehicle-updated event for vehicle:', vehicleId);
    
    if (!gpsTrackingSocket || !gpsTrackingSocket.connected) {
        console.error('❌ [TEST] Socket is not connected!');
        return;
    }
    
    // Simulate the event data
    const testEvent = {
        vehicleId: String(vehicleId),
        gpsDeviceIdChanged: true,
        oldGpsDeviceId: '7026270831',
        newGpsDeviceId: '7026270832',
        timestamp: new Date().toISOString()
    };
    
    console.log('🧪 [TEST] Simulating event:', testEvent);
    console.log('🧪 [TEST] Note: This is just for testing. Real events should come from server.');
};

// Initialize Socket.IO - try multiple ways to ensure it runs
export function initializeSocketIO() {
    // Check if Socket.IO is available
    if (typeof io === 'undefined') {
        console.error('Socket.IO library not available, retrying in 1 second...');
        setTimeout(() => {
            initializeSocketIO();
        }, 1000);
        return;
    }
    
    // Initialize Socket.IO connection
    initGpsTrackingSocket();
    
    // Start periodic refresh as backup (even when socket is connected)
    startPeriodicRefresh();
    
    // Check socket connection after 2 seconds
    setTimeout(() => {
        if (!gpsTrackingSocket || !gpsTrackingSocket.connected) {
            startPollingFallback();
        }
    }, 2000);
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        if (periodicRefreshInterval) {
            clearInterval(periodicRefreshInterval);
        }
        if (gpsTrackingSocket) {
            gpsTrackingSocket.disconnect();
        }
    });
}

