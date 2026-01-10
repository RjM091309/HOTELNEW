// ========================================
// VEHICLE MONITORING - GPS TRACKING (MODULAR)
// ========================================
// Main file that imports and coordinates all modules

// Import all modules
import { setMap, setIsFirstMapLoad } from './state.js';
import { initMap } from './map-init.js';
import { initializeSocketIO } from './socket-io.js';

// Import functions that need to be global
import { showVehicleInfo, showGpsDeviceInfo } from './infowindow.js';
import { initReplayModal } from './replay.js';

// Expose initMap globally for EJS template
window.initMap = initMap;

// Expose showVehicleInfo and showGpsDeviceInfo globally for InfoWindow buttons
window.showVehicleInfo = showVehicleInfo;
window.showGpsDeviceInfo = showGpsDeviceInfo;

// Initialize replay modal when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initReplayModal();
        });
    } else {
        initReplayModal();
    }
}

// Initialize Socket.IO when DOM is ready or immediately if already loaded
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        // DOM is still loading, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => {
                initializeSocketIO();
            }, 500);
        });
    } else {
        // DOM is already loaded, initialize immediately
        setTimeout(() => {
            initializeSocketIO();
        }, 500);
    }
} else {
    // No document object, try to initialize anyway after a delay
    setTimeout(() => {
        initializeSocketIO();
    }, 1000);
}

console.log('✅ Modular vehicle-monitoring.js loaded');
