// ========================================
// SOCKET.IO - Vehicle Monitoring
// ========================================

import { vehicleData, previousGpsDeviceIds } from './state.js';
import { loadVehicles } from './data-loader.js';
import { updateVehicleList } from './vehicle-list.js';
import { updateMapMarkers } from './markers.js';
import { updateTraceToggles } from './trace-toggle.js';
import { clearVehiclePath } from './markers.js';
import { markers, markerAnimations } from './state.js';

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
// IMPORTANT: All functions and logic depend on database, NOT GPS device directly
// Socket.IO event is just a notification that new data was saved to database
// We reload from database to ensure consistency
async function updateVehicleLocationFromSocket(deviceId, locationData) {
    try {
        if (!deviceId || !locationData) {
            console.warn('📍 Invalid socket data received:', { deviceId, locationData });
            return;
        }
        
        // IMPORTANT: Socket.IO event means data was saved to database
        // Reload from database to ensure all logic depends on database, not GPS device directly
        console.log(`📍 Socket.IO notification: Device ${deviceId} location updated in database, reloading from database...`);
        
        // Reload vehicles and GPS devices from database
        // This ensures all data comes from database, not from Socket.IO directly
        await loadVehicles();
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

