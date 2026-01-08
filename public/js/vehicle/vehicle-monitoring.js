// ========================================
// VEHICLE MONITORING - GPS TRACKING (MODULAR)
// ========================================
// Main file that imports and coordinates all modules

// Import all modules
import { setMap, setIsFirstMapLoad } from './state.js';
import { initMap } from './map-init.js';
import { initializeSocketIO } from './socket-io.js';
import { SOCKET_INIT_DELAY_MS, SOCKET_FALLBACK_DELAY_MS } from './constants.js';
import { logSuccess } from './logger.js';

// Import functions that need to be global
import { showVehicleInfo, showGpsDeviceInfo } from './infowindow.js';

// Expose initMap globally for EJS template (must be available immediately)
// This allows the EJS template to call initMap() after Google Maps script loads
if (typeof window !== 'undefined') {
    // Set immediately and also ensure it's available
    window.initMap = initMap;
    
    // Also set it after a small delay to ensure module is fully loaded
    // This handles cases where the module loads but assignment happens too early
    setTimeout(() => {
        if (!window.initMap) {
            window.initMap = initMap;
        }
    }, 0);
}

// Expose showVehicleInfo and showGpsDeviceInfo globally for InfoWindow buttons
window.showVehicleInfo = showVehicleInfo;
window.showGpsDeviceInfo = showGpsDeviceInfo;

// Initialize Socket.IO when DOM is ready or immediately if already loaded
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        // DOM is still loading, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => {
                initializeSocketIO();
            }, SOCKET_INIT_DELAY_MS);
        });
    } else {
        // DOM is already loaded, initialize immediately
        setTimeout(() => {
            initializeSocketIO();
        }, SOCKET_INIT_DELAY_MS);
    }
} else {
    // No document object, try to initialize anyway after a delay
    setTimeout(() => {
        initializeSocketIO();
    }, SOCKET_FALLBACK_DELAY_MS);
}

logSuccess('Modular vehicle-monitoring.js loaded', null, 'VehicleMonitoring');
