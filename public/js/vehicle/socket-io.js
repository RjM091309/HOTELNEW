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
import { calculateDistanceMeters } from './utils.js';
import {
    DEBOUNCE_DELAY_MS,
    POLLING_INTERVAL_MS,
    PERIODIC_REFRESH_INTERVAL_MS,
    SOCKET_RETRY_DELAY_MS,
    SOCKET_INIT_DELAY_MS,
    SOCKET_FALLBACK_DELAY_MS
} from './constants.js';
import { logError, logWarn, logDebug, logInfo } from './logger.js';

let gpsTrackingSocket = null;
let pollingInterval = null;
let isPollingActive = false;
let periodicRefreshInterval = null;

// Debounce queue for socket updates to prevent race conditions
const updateQueue = new Map();
const updateTimers = new Map();

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
            // Use debounced update to prevent race conditions
            queueSocketUpdate(data.deviceId, data.location);
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
        logError('Socket.IO library not available, retrying...', null, 'Socket.IO');
        setTimeout(() => {
            initGpsTrackingSocket();
        }, SOCKET_RETRY_DELAY_MS);
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
            logError('GPS Tracking Socket.IO connection error', error, 'Socket.IO');
            // Start polling fallback on connection error
            if (!isPollingActive) {
                startPollingFallback();
            }
        });
        
        gpsTrackingSocket.on('reconnect', (attemptNumber) => {
            logInfo(`Socket.IO reconnected (attempt ${attemptNumber})`, null, 'Socket.IO');
            setupSocketEventListeners();
            // Stop polling if socket reconnected
            if (isPollingActive) {
                stopPollingFallback();
            }
        });
        
        gpsTrackingSocket.on('reconnect_failed', () => {
            logError('GPS Tracking Socket.IO reconnection failed', null, 'Socket.IO');
            // Start polling fallback if reconnection fails
            if (!isPollingActive) {
                startPollingFallback();
            }
        });
        
    } catch (error) {
        logError('Error initializing GPS Tracking Socket.IO', error, 'Socket.IO');
        // Start polling fallback on error
        if (!isPollingActive) {
            startPollingFallback();
        }
        // Retry after configured delay
        setTimeout(() => {
            initGpsTrackingSocket();
        }, SOCKET_FALLBACK_DELAY_MS);
    }
}

// Start periodic polling as fallback when Socket.IO is not available
function startPollingFallback() {
    if (isPollingActive) return;
    
    isPollingActive = true;
    
    // Poll immediately, then every configured interval
    loadVehicles();
    
    pollingInterval = setInterval(() => {
        loadVehicles();
    }, POLLING_INTERVAL_MS);
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

// Queue socket update with debouncing to prevent race conditions
function queueSocketUpdate(deviceId, locationData) {
    // Clear existing timer for this device
    if (updateTimers.has(deviceId)) {
        clearTimeout(updateTimers.get(deviceId));
    }
    
    // Store latest location data (overwrites previous queued data)
    updateQueue.set(deviceId, locationData);
    
    // Set debounce timer
    const timer = setTimeout(() => {
        const queuedData = updateQueue.get(deviceId);
        if (queuedData) {
            updateQueue.delete(deviceId);
            updateTimers.delete(deviceId);
            // Process the update
            updateVehicleLocationFromSocket(deviceId, queuedData).catch(err => {
                logError('Error processing queued socket update', err, 'Socket.IO');
            });
        }
    }, DEBOUNCE_DELAY_MS);
    
    updateTimers.set(deviceId, timer);
}

// Update vehicle location from Socket.IO event
// For smooth movement: Use Socket.IO data directly for immediate marker animation
// Then reload from database to ensure data consistency
async function updateVehicleLocationFromSocket(deviceId, locationData) {
    try {
        if (!deviceId || !locationData || !locationData.lat || !locationData.lng) {
            logWarn('Invalid socket data received', { deviceId, locationData }, 'Socket.IO');
            return;
        }
        
        const newPosition = { lat: locationData.lat, lng: locationData.lng };
        
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
        
        // Update vehicle/device location data in memory for real-time InfoWindow updates
        // IMPORTANT: Don't update isMoving here - it should be determined by database location changes only
        // Socket.IO is for real-time position updates, but isMoving should come from database comparison
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
                foundVehicle.location.battery = parseFloat(locationData.battery);
            }
            if (locationData.isCharging !== null && locationData.isCharging !== undefined) {
                foundVehicle.location.isCharging = !!locationData.isCharging;
            }
            if (locationData.satelliteCount !== null && locationData.satelliteCount !== undefined) {
                foundVehicle.location.satelliteCount = parseInt(locationData.satelliteCount);
            }
            if (locationData.gsmSignal !== null && locationData.gsmSignal !== undefined) {
                foundVehicle.location.gsmSignal = parseInt(locationData.gsmSignal);
            }
            foundVehicle.location.lastUpdate = locationData.timestamp || new Date();
            
            // Don't update isMoving from Socket.IO - it should only be determined by database location changes
            // Socket.IO may have GPS jitter, so rely on database saves (which filter jitter) for isMoving status
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
                foundDevice.location.battery = parseFloat(locationData.battery);
            }
            if (locationData.isCharging !== null && locationData.isCharging !== undefined) {
                foundDevice.location.isCharging = !!locationData.isCharging;
            }
            if (locationData.satelliteCount !== null && locationData.satelliteCount !== undefined) {
                foundDevice.location.satelliteCount = parseInt(locationData.satelliteCount);
            }
            if (locationData.gsmSignal !== null && locationData.gsmSignal !== undefined) {
                foundDevice.location.gsmSignal = parseInt(locationData.gsmSignal);
            }
            foundDevice.location.lastUpdate = locationData.timestamp || new Date();
            
            // Don't update isMoving from Socket.IO - it should only be determined by database location changes
        }
        
        // 🔁 CORRECT LOGIC: Only update marker position if vehicle/device is actually moving
        // CRITICAL: Check isMoving status from database comparison (not Socket.IO speed)
        // If isMoving = false (standby), ignore Socket.IO position updates (GPS jitter)
        // If isMoving = true (in-transit), animate marker smoothly
        if (markerKey && markers[markerKey]) {
            const marker = markers[markerKey];
            if (!marker) return; // Null safety check
            
            const currentPos = marker.getPosition();
            if (!currentPos && !newPosition) return; // Need at least one position
            
            // Get isMoving status from vehicle/device data (determined by database location changes)
            const isMoving = foundVehicle ? (foundVehicle.isMoving || false) : (foundDevice ? (foundDevice.isMoving || false) : false);
            
            // Only update marker position if actually moving (database confirmed movement)
            // If standby, ignore Socket.IO position updates to prevent GPS jitter from moving marker
            if (isMoving) {
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
        updateOpenInfoWindow().catch(err => logWarn('InfoWindow update error', err, 'Socket.IO'));
        
        // Don't reload from database immediately - Socket.IO is the source of truth for live movement
        // Database is just for history. Only reload periodically or on page refresh
    } catch (error) {
        logError('Error handling socket notification', error, 'Socket.IO');
        // On error, try to reload vehicles as fallback
        try {
            await loadVehicles();
        } catch (reloadError) {
            logError('Error reloading vehicles', reloadError, 'Socket.IO');
        }
    }
}

// Start periodic refresh (every 15 seconds as backup)
export function startPeriodicRefresh() {
    // Clear existing interval if any
    if (periodicRefreshInterval) {
        clearInterval(periodicRefreshInterval);
    }
    
    // Refresh every configured interval as a backup (faster detection of GPS Device ID changes)
    periodicRefreshInterval = setInterval(() => {
        // Always refresh as backup to detect GPS Device ID changes even if socket fails
        loadVehicles();
    }, PERIODIC_REFRESH_INTERVAL_MS);
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
    logInfo('Vehicle Monitoring Status', status, 'Test');
    return status;
};

// Test function to manually trigger vehicle update event (for testing)
window.testVehicleUpdateEvent = function(vehicleId = '38') {
    logDebug('Simulating vehicle-updated event for vehicle', { vehicleId }, 'Test');
    
    if (!gpsTrackingSocket || !gpsTrackingSocket.connected) {
        logError('Socket is not connected', null, 'Test');
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
    
    logDebug('Simulating event', testEvent, 'Test');
    logDebug('Note: This is just for testing. Real events should come from server.', null, 'Test');
};

// Initialize Socket.IO - try multiple ways to ensure it runs
export function initializeSocketIO() {
    // Check if Socket.IO is available
    if (typeof io === 'undefined') {
        logError('Socket.IO library not available, retrying...', null, 'Socket.IO');
        setTimeout(() => {
            initializeSocketIO();
        }, SOCKET_RETRY_DELAY_MS);
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
        // Clear all debounce timers
        updateTimers.forEach(timer => clearTimeout(timer));
        updateTimers.clear();
        updateQueue.clear();
        if (gpsTrackingSocket) {
            gpsTrackingSocket.disconnect();
        }
    });
}

