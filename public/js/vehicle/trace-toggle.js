// ========================================
// TRACE TOGGLE - Vehicle Monitoring
// ========================================

import { map, markers, vehicleData, gpsDevicesData, traceEnabled, traceToggles, polylines } from './state.js';
import {
    MAX_MAP_ZOOM,
    BOUNCE_ANIMATION_DURATION_MS,
    TRACE_PAN_DELAY_MS
} from './constants.js';
import { logWarn, logError, logDebug } from './logger.js';

// Create trace toggle container (wrapper for all device toggles)
export function createTraceToggleContainer() {
    if (!map) return;
    
    // Check if container already exists
    let traceContainer = document.getElementById('traceToggleContainer');
    if (!traceContainer) {
        traceContainer = document.createElement('div');
        traceContainer.id = 'traceToggleContainer';
        traceContainer.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: calc(100% - 100px);
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        // Add to map container
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
            mapDiv.appendChild(traceContainer);
        }
    }
    
    return traceContainer;
}

// Hide trace toggle container (e.g., when Street View is open)
export function hideTraceToggleContainer() {
    const traceContainer = document.getElementById('traceToggleContainer');
    if (traceContainer) {
        traceContainer.style.display = 'none';
    }
}

// Show trace toggle container (e.g., when Street View is closed)
export function showTraceToggleContainer() {
    const traceContainer = document.getElementById('traceToggleContainer');
    if (traceContainer) {
        traceContainer.style.display = 'flex';
    }
}

// Create or update trace toggle for a specific device/vehicle
export function createTraceToggleForDevice(deviceKey, deviceName, deviceId) {
    if (!map) return;
    
    const container = createTraceToggleContainer();
    if (!container) return;
    
    // Check if toggle already exists
    let traceToggle = traceToggles[deviceKey];
    if (traceToggle && traceToggle.parentNode) {
        // Toggle already exists; refresh label/data then update state
        const traceLabel = traceToggle.querySelector('.traceLabel');
        if (traceLabel) {
            traceLabel.textContent = deviceName || deviceId || 'Trace';
        }
        traceToggle.dataset.deviceKey = deviceKey;
        updateTraceToggleState(deviceKey);
        return;
    }
    
    // Initialize trace state for this device (default: disabled)
    if (traceEnabled[deviceKey] === undefined) {
        traceEnabled[deviceKey] = false;
    }
    
    // Create toggle container
    traceToggle = document.createElement('div');
    traceToggle.id = `traceToggle_${deviceKey}`;
    traceToggle.dataset.deviceKey = deviceKey;
    traceToggle.style.cssText = `
        background: white;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s;
    `;
    
    // Hover effect
    traceToggle.addEventListener('mouseenter', function() {
        this.style.background = '#f9fafb';
    });
    traceToggle.addEventListener('mouseleave', function() {
        this.style.background = 'white';
    });
    
    // Create toggle switch
    const toggleSwitch = document.createElement('div');
    toggleSwitch.className = 'traceSwitch';
    toggleSwitch.style.cssText = `
        width: 44px;
        height: 24px;
        background: ${traceEnabled[deviceKey] ? '#3b82f6' : '#d1d5db'};
        border-radius: 12px;
        position: relative;
        transition: background-color 0.25s linear;
        flex-shrink: 0;
    `;
    
    // Create toggle handle (circle)
    const toggleHandle = document.createElement('div');
    toggleHandle.className = 'traceHandle';
    toggleHandle.style.cssText = `
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        will-change: transform;
        transform: translateX(${traceEnabled[deviceKey] ? '20px' : '0px'});
    `;
    
    toggleSwitch.appendChild(toggleHandle);
    
    // Create text label (show device name or ID)
    const traceLabel = document.createElement('span');
    traceLabel.className = 'traceLabel';
    traceLabel.textContent = deviceName || deviceId || 'Trace';
    traceLabel.style.cssText = `
        font-size: 13px;
        font-weight: 600;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
    `;
    
    // Add elements to container
    traceToggle.appendChild(toggleSwitch);
    traceToggle.appendChild(traceLabel);
    
    // Add to container
    container.appendChild(traceToggle);
    
    // Store reference
    traceToggles[deviceKey] = traceToggle;
    
    // Update toggle state function
    function updateState() {
        const isEnabled = traceEnabled[deviceKey];
        // Update background color
        toggleSwitch.style.background = isEnabled ? '#3b82f6' : '#d1d5db';
        // Use transform for smooth slide animation (better than left property)
        toggleHandle.style.transform = isEnabled ? 'translateX(20px)' : 'translateX(0px)';
        
        // Show/hide polyline for this specific device
        if (polylines[deviceKey]) {
            if (isEnabled) {
                polylines[deviceKey].setMap(map);
            } else {
                polylines[deviceKey].setMap(null);
            }
        }
    }
    
    // Click handler - toggle trace and center on device
    traceToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        traceEnabled[deviceKey] = !traceEnabled[deviceKey];
        updateState();
        
            // Smoothly pan map to this device - get position from data, not marker
            let position = null;
            const isVehicle = !deviceKey.startsWith('gps_');
            
            if (isVehicle) {
                // Get position from vehicle data (use string ID)
                const vehicleId = String(deviceKey); // Ensure string ID
                const vehicle = vehicleData[vehicleId];
                if (vehicle && vehicle.location && vehicle.location.lat && vehicle.location.lng) {
                    position = { lat: vehicle.location.lat, lng: vehicle.location.lng };
                    logDebug(`Trace toggle: Panning to vehicle ${vehicleId}`, position, 'TraceToggle');
                } else {
                    logWarn(`Vehicle ${vehicleId} not found in vehicleData`, null, 'TraceToggle');
                }
            } else {
                // Get position from GPS device data
                const deviceId = deviceKey.replace('gps_', '');
                const device = gpsDevicesData[deviceId];
                if (device && device.location && device.location.lat && device.location.lng) {
                    position = { lat: device.location.lat, lng: device.location.lng };
                    logDebug(`Trace toggle: Panning to GPS device ${deviceId}`, position, 'TraceToggle');
                } else {
                    logWarn(`GPS device ${deviceId} not found in gpsDevicesData`, null, 'TraceToggle');
                }
            }
            
            if (position) {
                // Verify position is valid
                if (isNaN(position.lat) || isNaN(position.lng) || position.lat === 0 || position.lng === 0) {
                    logError(`Invalid position`, position, 'TraceToggle');
                    return;
                }
                
                // Smooth pan animation using actual data position
                map.panTo(position);
                
                // Set zoom level smoothly
                setTimeout(() => {
                    map.setZoom(MAX_MAP_ZOOM);
                }, TRACE_PAN_DELAY_MS);
                
                // Bounce animation on marker if it exists
                const marker = markers[deviceKey];
                if (marker) {
                    marker.setAnimation(google.maps.Animation.BOUNCE);
                    setTimeout(() => {
                        if (marker) {
                            marker.setAnimation(null);
                        }
                    }, BOUNCE_ANIMATION_DURATION_MS);
                } else {
                    logWarn(`Marker not found for deviceKey ${deviceKey}`, null, 'TraceToggle');
                }
            } else {
                logError(`No position found for deviceKey ${deviceKey}`, null, 'TraceToggle');
            }
    });
    
    // Initial state
    updateState();
}

// Update trace toggle state for a device
export function updateTraceToggleState(deviceKey) {
    const toggle = traceToggles[deviceKey];
    if (!toggle) return;
    
    const toggleSwitch = toggle.querySelector('.traceSwitch');
    const toggleHandle = toggle.querySelector('.traceHandle');
    
    if (toggleSwitch && toggleHandle) {
        const isEnabled = traceEnabled[deviceKey] === true; // Default to false
        // Update background and use transform for smooth slide
        toggleSwitch.style.background = isEnabled ? '#3b82f6' : '#d1d5db';
        toggleHandle.style.transform = isEnabled ? 'translateX(20px)' : 'translateX(0px)';
        
        // Update polyline visibility
        if (polylines[deviceKey]) {
            if (isEnabled) {
                polylines[deviceKey].setMap(map);
            } else {
                polylines[deviceKey].setMap(null);
            }
        }
    }
}

// Update all trace toggles when vehicles/devices are loaded
export function updateTraceToggles() {
    if (!map) return;
    
    // Create container if it doesn't exist
    createTraceToggleContainer();
    
    // Add toggles for all vehicles
    Object.values(vehicleData).forEach(vehicle => {
        if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
            const deviceKey = String(vehicle.id);
            const deviceName = vehicle.modelName || vehicle.plateNumber || `Vehicle ${vehicle.id}`;
            createTraceToggleForDevice(deviceKey, deviceName, vehicle.gpsDeviceId);
        }
    });
    
    // Add toggles for all unassigned GPS devices
    Object.values(gpsDevicesData).forEach(device => {
        if (!device.isAssigned && device.location && device.location.lat && device.location.lng) {
            const deviceKey = `gps_${device.deviceId}`;
            const deviceName = `GPS ${device.deviceId.substring(device.deviceId.length - 4)}`;
            createTraceToggleForDevice(deviceKey, deviceName, device.deviceId);
        }
    });
    
    // Remove toggles for devices that no longer exist
    Object.keys(traceToggles).forEach(deviceKey => {
        const toggle = traceToggles[deviceKey];
        if (!toggle) return;

        const isVehicle = !deviceKey.startsWith('gps_');
        let dataExists = false;
        let hasLocation = false;
        let keepToggle = true;
        
        if (isVehicle) {
            const vehicle = vehicleData[deviceKey];
            dataExists = !!vehicle;
            hasLocation = !!(vehicle && vehicle.location);
            // Vehicles always keep toggle if they exist
        } else {
            const deviceId = deviceKey.replace('gps_', '');
            const device = gpsDevicesData[deviceId];
            dataExists = !!device;
            hasLocation = !!(device && device.location);
            // Only keep unassigned GPS device toggles; assigned ones are removed
            keepToggle = dataExists && device && !device.isAssigned;
        }
        
        if (!dataExists || !keepToggle) {
            toggle.remove();
            delete traceToggles[deviceKey];
            delete traceEnabled[deviceKey];
            return;
        }

        // Keep toggle but disable interaction when location is missing
        const disabled = !hasLocation;
        toggle.style.opacity = disabled ? '0.5' : '1';
        toggle.style.pointerEvents = disabled ? 'none' : 'auto';
    });
}

