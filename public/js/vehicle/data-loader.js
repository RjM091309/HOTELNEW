// ========================================
// DATA LOADER - Vehicle Monitoring
// ========================================

import { 
    vehicleData, 
    gpsDevicesData, 
    previousGpsDeviceIds, 
    lastSavedLocations, 
    lastMovementTime,
    lastVehicleBatteryLevels,
    lastGpsBatteryLevels,
    lastVehicleChargingState,
    lastGpsChargingState,
    lastVehicleBatteryChangeTime,
    lastGpsBatteryChangeTime
} from './state.js';
import { calculateDistanceMeters } from './utils.js';
import { clearVehiclePath } from './markers.js';
import { updateVehicleList } from './vehicle-list.js';
import { updateMapMarkers } from './markers.js';
import { updateTraceToggles } from './trace-toggle.js';
import { updateOpenInfoWindow } from './infowindow.js';
import {
    MOVEMENT_DISTANCE_METERS,
    MOVEMENT_MIN_SPEED_KPH,
    BATTERY_STALE_THRESHOLD_MS,
    COORDINATE_MULTIPLIER
} from './constants.js';
import { logError, logWarn } from './logger.js';

// Load vehicles data for map initialization (without updating UI)
export async function loadVehiclesForMapInit() {
    try {
        // Load vehicles with GPS
        let vehiclesResponse;
        let vehiclesData = { success: false, data: [] };
        
        try {
            vehiclesResponse = await fetch('/vehicle/api/monitoring/vehicles');
            if (!vehiclesResponse.ok) {
                throw new Error(`HTTP error! status: ${vehiclesResponse.status}`);
            }
            vehiclesData = await vehiclesResponse.json();
        } catch (fetchError) {
            logError('Error fetching vehicles', fetchError, 'DataLoader');
            // Continue with empty data - map will still initialize
        }
        
        // Load all GPS devices (including unassigned) - get all devices that have ever sent data
        let gpsResponse;
        let gpsData = { success: false, data: [] };
        
        try {
            gpsResponse = await fetch('/vehicle/api/monitoring/gps-devices');
            if (!gpsResponse.ok) {
                throw new Error(`HTTP error! status: ${gpsResponse.status}`);
            }
            gpsData = await gpsResponse.json();
        } catch (fetchError) {
            logError('Error fetching GPS devices', fetchError, 'DataLoader');
            // Continue with empty data - map will still initialize
        }
        
        if (vehiclesData.success) {
            // Initialize previous GPS Device IDs on first load
            if (Object.keys(previousGpsDeviceIds).length === 0) {
                vehiclesData.data.forEach(vehicle => {
                    previousGpsDeviceIds[String(vehicle.id)] = vehicle.gpsDeviceId || null;
                    // Seed battery baseline and charging state so the UI has data on first load
                    const vehicleId = String(vehicle.id);
                    if (vehicle.location && vehicle.location.battery !== null && vehicle.location.battery !== undefined) {
                        lastVehicleBatteryLevels[vehicleId] = Number(vehicle.location.battery);
                        lastVehicleBatteryChangeTime[vehicleId] = Date.now(); // Initialize change time
                        if (vehicle.location.isCharging !== undefined && vehicle.location.isCharging !== null) {
                            lastVehicleChargingState[vehicleId] = !!vehicle.location.isCharging;
                        }
                    }
                });
            }
            
            // Clear and populate vehicleData (use string IDs for consistency)
            Object.keys(vehicleData).forEach(key => delete vehicleData[key]);
            vehiclesData.data.forEach(vehicle => {
                const vehicleId = String(vehicle.id);
                vehicleData[vehicleId] = vehicle;
            });
        }
        
        if (gpsData.success) {
            // Clear and populate gpsDevicesData
            Object.keys(gpsDevicesData).forEach(key => delete gpsDevicesData[key]);
            gpsData.data.forEach(device => {
                if (device.location && device.location.battery !== null && device.location.battery !== undefined) {
                    lastGpsBatteryLevels[device.deviceId] = Number(device.location.battery);
                    lastGpsBatteryChangeTime[device.deviceId] = Date.now(); // Initialize change time
                    if (device.location.isCharging !== undefined && device.location.isCharging !== null) {
                        lastGpsChargingState[device.deviceId] = !!device.location.isCharging;
                    }
                }
                gpsDevicesData[device.deviceId] = device;
            });
        }
    } catch (error) {
        logError('Error loading vehicles for map init', error, 'DataLoader');
    }
}

// Load vehicles with GPS location
export async function loadVehicles() {
    try {
        // Load vehicles with GPS
        let vehiclesResponse;
        let vehiclesData = { success: false, data: [] };
        
        try {
            vehiclesResponse = await fetch('/vehicle/api/monitoring/vehicles');
            if (!vehiclesResponse.ok) {
                throw new Error(`HTTP error! status: ${vehiclesResponse.status}`);
            }
            vehiclesData = await vehiclesResponse.json();
        } catch (fetchError) {
            logError('Error fetching vehicles', fetchError, 'DataLoader');
            // Show user-friendly error message
            const vehicleListEl = document.getElementById('vehicleList');
            if (vehicleListEl) {
                vehicleListEl.innerHTML = '<div class="alert alert-warning"><i class="fa fa-exclamation-triangle"></i> Unable to load vehicles. Please check your connection and try again.</div>';
            }
            // Return early to prevent further errors
            return;
        }
        
        // Load all GPS devices (including unassigned) - get all devices that have ever sent data
        let gpsResponse;
        let gpsData = { success: false, data: [] };
        
        try {
            gpsResponse = await fetch('/vehicle/api/monitoring/gps-devices');
            if (!gpsResponse.ok) {
                throw new Error(`HTTP error! status: ${gpsResponse.status}`);
            }
            gpsData = await gpsResponse.json();
        } catch (fetchError) {
            logWarn('Error fetching GPS devices', fetchError, 'DataLoader');
            // Continue with empty GPS data - vehicles will still load
        }
        
        if (vehiclesData.success) {
            // Check for GPS Device ID changes before updating
            vehiclesData.data.forEach(vehicle => {
                const vehicleId = String(vehicle.id);
                const currentGpsId = vehicle.gpsDeviceId || null;
                const previousGpsId = previousGpsDeviceIds[vehicleId];
                
                // If GPS Device ID changed, clear old location data
                if (previousGpsId !== undefined && previousGpsId !== currentGpsId) {
                    // Clear old location data immediately if vehicle exists
                    if (vehicleData[vehicleId]) {
                        // Clear old path when GPS device changes
                        clearVehiclePath(vehicleId);
                        
                        vehicleData[vehicleId].location = null; // Clear location for new device
                        vehicleData[vehicleId].isOnline = false; // Mark as offline until new device sends data
                    }
                }
                
                // Update previous GPS Device ID
                previousGpsDeviceIds[vehicleId] = currentGpsId;
            });
            
            // Update vehicleData with fresh data and determine isMoving based on position changes
            // Clear existing data first
            Object.keys(vehicleData).forEach(key => delete vehicleData[key]);
            
            vehiclesData.data.forEach(vehicle => {
                // Compare new database position with previous lastSavedLocation to determine if moving
                const newLocation = vehicle.location && vehicle.location.lat && vehicle.location.lng ? {
                    lat: vehicle.location.lat,
                    lng: vehicle.location.lng
                } : null;
                // Use string ID for consistency
                const vehicleId = String(vehicle.id);
                
                // Charging detection (vehicle) with time-based logic
                const newBattery = vehicle.location && vehicle.location.battery !== null && vehicle.location.battery !== undefined
                    ? Number(vehicle.location.battery)
                    : null;
                const prevBattery = lastVehicleBatteryLevels[vehicleId];
                const apiChargingFlag = vehicle.location && vehicle.location.isCharging;
                let isCharging = false;
                const now = Date.now();
                
                if (prevBattery !== undefined && newBattery !== null) {
                    if (newBattery > prevBattery) {
                        // Battery level increased => definitely charging
                        isCharging = true;
                        lastVehicleBatteryChangeTime[vehicleId] = now; // Update change time
                    } else if (newBattery === prevBattery) {
                        // Battery level unchanged - check if stale
                        const lastChangeTime = lastVehicleBatteryChangeTime[vehicleId] || now;
                        const timeSinceLastChange = now - lastChangeTime;
                        
                        if (timeSinceLastChange > BATTERY_STALE_THRESHOLD_MS) {
                            // Battery level unchanged for > 5 minutes => assume not charging
                            isCharging = false;
                        } else {
                            // Battery level unchanged but recent => preserve prior state
                            isCharging = !!lastVehicleChargingState[vehicleId];
                        }
                    } else {
                        // Battery level decreased => not charging
                        isCharging = false;
                        lastVehicleBatteryChangeTime[vehicleId] = now; // Update change time
                    }
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    // No baseline yet (e.g., page refresh) - trust backend flag
                    isCharging = !!apiChargingFlag;
                    if (newBattery !== null) {
                        lastVehicleBatteryChangeTime[vehicleId] = now; // Initialize change time
                    }
                }
                
                if (vehicle.location) {
                    vehicle.location.isCharging = !!isCharging;
                }
                
                if (newBattery !== null) {
                    // Update battery level and change time if level changed
                    if (prevBattery === undefined || newBattery !== prevBattery) {
                        lastVehicleBatteryChangeTime[vehicleId] = now;
                    }
                    lastVehicleBatteryLevels[vehicleId] = newBattery;
                    lastVehicleChargingState[vehicleId] = isCharging;
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    lastVehicleChargingState[vehicleId] = !!apiChargingFlag;
                }
                
                // isMoving is now calculated in database and returned from API
                // Just use the isMoving value from the API response
                // If not provided, default to false
                vehicle.isMoving = vehicle.isMoving !== null && vehicle.isMoving !== undefined ? !!vehicle.isMoving : false;
                
                // Track last saved location for reference (no longer used for isMoving calculation)
                if (newLocation) {
                    lastSavedLocations[vehicleId] = {
                        lat: Math.round(newLocation.lat * COORDINATE_MULTIPLIER) / COORDINATE_MULTIPLIER,
                        lng: Math.round(newLocation.lng * COORDINATE_MULTIPLIER) / COORDINATE_MULTIPLIER
                    };
                }
                
                vehicleData[vehicleId] = vehicle;
            });
        }
        
        if (gpsData.success) {
            // Clear and populate gpsDevicesData
            Object.keys(gpsDevicesData).forEach(key => delete gpsDevicesData[key]);
            
            // Track last saved locations for GPS devices (similar to vehicles)
            const lastSavedGpsLocations = window.lastSavedGpsLocations || {};
            window.lastSavedGpsLocations = lastSavedGpsLocations;
            
            gpsData.data.forEach(device => {
                // Charging detection (unassigned GPS device) with time-based logic
                const newBattery = device.location && device.location.battery !== null && device.location.battery !== undefined
                    ? Number(device.location.battery)
                    : null;
                const prevBattery = lastGpsBatteryLevels[device.deviceId];
                const apiChargingFlag = device.location && device.location.isCharging;
                let isCharging = false;
                const now = Date.now();
                
                if (prevBattery !== undefined && newBattery !== null) {
                    if (newBattery > prevBattery) {
                        // Battery level increased => definitely charging
                        isCharging = true;
                        lastGpsBatteryChangeTime[device.deviceId] = now; // Update change time
                    } else if (newBattery === prevBattery) {
                        // Battery level unchanged - check if stale
                        const lastChangeTime = lastGpsBatteryChangeTime[device.deviceId] || now;
                        const timeSinceLastChange = now - lastChangeTime;
                        
                        if (timeSinceLastChange > BATTERY_STALE_THRESHOLD_MS) {
                            // Battery level unchanged for > 5 minutes => assume not charging
                            isCharging = false;
                        } else {
                            // Battery level unchanged but recent => preserve prior state
                            isCharging = !!lastGpsChargingState[device.deviceId];
                        }
                    } else {
                        // Battery level decreased => not charging
                        isCharging = false;
                        lastGpsBatteryChangeTime[device.deviceId] = now; // Update change time
                    }
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    // No baseline yet (e.g., page refresh) - trust backend flag
                    isCharging = !!apiChargingFlag;
                    if (newBattery !== null) {
                        lastGpsBatteryChangeTime[device.deviceId] = now; // Initialize change time
                    }
                }
                
                if (device.location) {
                    device.location.isCharging = !!isCharging;
                }
                
                if (newBattery !== null) {
                    // Update battery level and change time if level changed
                    if (prevBattery === undefined || newBattery !== prevBattery) {
                        lastGpsBatteryChangeTime[device.deviceId] = now;
                    }
                    lastGpsBatteryLevels[device.deviceId] = newBattery;
                    lastGpsChargingState[device.deviceId] = isCharging;
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    lastGpsChargingState[device.deviceId] = !!apiChargingFlag;
                }
                
                // isMoving is now calculated in database and returned from API
                // Just use the isMoving value from the API response
                // If not provided, default to false
                device.isMoving = device.isMoving !== null && device.isMoving !== undefined ? !!device.isMoving : false;
                
                // Track last saved location for reference (no longer used for isMoving calculation)
                const newLocation = device.location && device.location.lat && device.location.lng ? {
                    lat: device.location.lat,
                    lng: device.location.lng
                } : null;
                
                if (newLocation) {
                    lastSavedGpsLocations[device.deviceId] = {
                        lat: Math.round(newLocation.lat * COORDINATE_MULTIPLIER) / COORDINATE_MULTIPLIER,
                        lng: Math.round(newLocation.lng * COORDINATE_MULTIPLIER) / COORDINATE_MULTIPLIER
                    };
                }
                
                gpsDevicesData[device.deviceId] = device;
            });
        }
        
        // Update UI only if we have data
        try {
            updateVehicleList();
            updateMapMarkers();
            updateTraceToggles(); // Update trace toggles for all devices
            // Update open InfoWindow with latest data (real-time) - fire and forget
            updateOpenInfoWindow().catch(err => logWarn('InfoWindow update error', err, 'DataLoader'));
        } catch (uiError) {
            logWarn('Error updating UI', uiError, 'DataLoader');
            // Don't show error to user - UI update failures are non-critical
        }
    } catch (error) {
        logError('Unexpected error loading vehicles', error, 'DataLoader');
        const vehicleListEl = document.getElementById('vehicleList');
        if (vehicleListEl) {
            vehicleListEl.innerHTML = '<div class="alert alert-danger"><i class="fa fa-exclamation-circle"></i> An unexpected error occurred. Please refresh the page.</div>';
        }
    }
}

