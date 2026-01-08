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
    lastGpsChargingState
} from './state.js';
import { calculateDistanceMeters } from './utils.js';
import { clearVehiclePath } from './markers.js';
import { updateVehicleList } from './vehicle-list.js';
import { updateMapMarkers } from './markers.js';
import { updateTraceToggles } from './trace-toggle.js';
import { updateOpenInfoWindow } from './infowindow.js';

// Movement thresholds to reduce GPS jitter on frontend
const MOVEMENT_DISTANCE_METERS = 30; // meters
const MOVEMENT_MIN_SPEED_KPH = 3;    // km/h

// Load vehicles data for map initialization (without updating UI)
export async function loadVehiclesForMapInit() {
    try {
        // Load vehicles with GPS
        const vehiclesResponse = await fetch('/vehicle/api/monitoring/vehicles');
        const vehiclesData = await vehiclesResponse.json();
        
        // Load all GPS devices (including unassigned) - get all devices that have ever sent data
        const gpsResponse = await fetch('/vehicle/api/monitoring/gps-devices');
        const gpsData = await gpsResponse.json();
        
        if (vehiclesData.success) {
            // Initialize previous GPS Device IDs on first load
            if (Object.keys(previousGpsDeviceIds).length === 0) {
                vehiclesData.data.forEach(vehicle => {
                    previousGpsDeviceIds[String(vehicle.id)] = vehicle.gpsDeviceId || null;
                    // Seed battery baseline and charging state so the UI has data on first load
                    if (vehicle.location && vehicle.location.battery !== null && vehicle.location.battery !== undefined) {
                        lastVehicleBatteryLevels[vehicle.id] = Number(vehicle.location.battery);
                        if (vehicle.location.isCharging !== undefined && vehicle.location.isCharging !== null) {
                            lastVehicleChargingState[vehicle.id] = !!vehicle.location.isCharging;
                        }
                    }
                });
            }
            
            // Clear and populate vehicleData
            Object.keys(vehicleData).forEach(key => delete vehicleData[key]);
            vehiclesData.data.forEach(vehicle => {
                vehicleData[vehicle.id] = vehicle;
            });
        }
        
        if (gpsData.success) {
            // Clear and populate gpsDevicesData
            Object.keys(gpsDevicesData).forEach(key => delete gpsDevicesData[key]);
            gpsData.data.forEach(device => {
                if (device.location && device.location.battery !== null && device.location.battery !== undefined) {
                    lastGpsBatteryLevels[device.deviceId] = Number(device.location.battery);
                    if (device.location.isCharging !== undefined && device.location.isCharging !== null) {
                        lastGpsChargingState[device.deviceId] = !!device.location.isCharging;
                    }
                }
                gpsDevicesData[device.deviceId] = device;
            });
        }
    } catch (error) {
        console.error('Error loading vehicles for map init:', error);
    }
}

// Load vehicles with GPS location
export async function loadVehicles() {
    try {
        // Load vehicles with GPS
        const vehiclesResponse = await fetch('/vehicle/api/monitoring/vehicles');
        const vehiclesData = await vehiclesResponse.json();
        
        // Load all GPS devices (including unassigned) - get all devices that have ever sent data
        const gpsResponse = await fetch('/vehicle/api/monitoring/gps-devices');
        const gpsData = await gpsResponse.json();
        
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
                // Charging detection (vehicle)
                const newBattery = vehicle.location && vehicle.location.battery !== null && vehicle.location.battery !== undefined
                    ? Number(vehicle.location.battery)
                    : null;
                const prevBattery = lastVehicleBatteryLevels[vehicle.id];
                const apiChargingFlag = vehicle.location && vehicle.location.isCharging;
                let isCharging = false;
                if (prevBattery !== undefined && newBattery !== null) {
                    if (newBattery > prevBattery) {
                        isCharging = true; // rising => charging
                    } else if (newBattery === prevBattery) {
                        // preserve prior charging state when level stays the same
                        isCharging = !!lastVehicleChargingState[vehicle.id];
                    } else {
                        isCharging = false; // dropped => stop charging
                    }
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    // No baseline yet (e.g., page refresh) - trust backend flag
                    isCharging = !!apiChargingFlag;
                }
                if (vehicle.location) {
                    vehicle.location.isCharging = !!isCharging;
                }
                if (newBattery !== null) {
                    lastVehicleBatteryLevels[vehicle.id] = newBattery;
                    lastVehicleChargingState[vehicle.id] = isCharging;
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    lastVehicleChargingState[vehicle.id] = !!apiChargingFlag;
                }
                
                // isMoving is now calculated in database and returned from API
                // Just use the isMoving value from the API response
                // If not provided, default to false
                vehicle.isMoving = vehicle.isMoving !== null && vehicle.isMoving !== undefined ? !!vehicle.isMoving : false;
                
                // Track last saved location for reference (no longer used for isMoving calculation)
                if (newLocation) {
                    lastSavedLocations[vehicle.id] = {
                        lat: Math.round(newLocation.lat * 1000000) / 1000000,
                        lng: Math.round(newLocation.lng * 1000000) / 1000000
                    };
                }
                
                vehicleData[vehicle.id] = vehicle;
            });
        }
        
        if (gpsData.success) {
            // Clear and populate gpsDevicesData
            Object.keys(gpsDevicesData).forEach(key => delete gpsDevicesData[key]);
            
            // Track last saved locations for GPS devices (similar to vehicles)
            const lastSavedGpsLocations = window.lastSavedGpsLocations || {};
            window.lastSavedGpsLocations = lastSavedGpsLocations;
            
            gpsData.data.forEach(device => {
                // Charging detection (unassigned GPS device)
                const newBattery = device.location && device.location.battery !== null && device.location.battery !== undefined
                    ? Number(device.location.battery)
                    : null;
                const prevBattery = lastGpsBatteryLevels[device.deviceId];
                const apiChargingFlag = device.location && device.location.isCharging;
                let isCharging = false;
                if (prevBattery !== undefined && newBattery !== null) {
                    if (newBattery > prevBattery) {
                        isCharging = true;
                    } else if (newBattery === prevBattery) {
                        isCharging = !!lastGpsChargingState[device.deviceId];
                    } else {
                        isCharging = false;
                    }
                } else if (apiChargingFlag !== undefined && apiChargingFlag !== null) {
                    isCharging = !!apiChargingFlag;
                }
                if (device.location) {
                    device.location.isCharging = !!isCharging;
                }
                if (newBattery !== null) {
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
                        lat: Math.round(newLocation.lat * 1000000) / 1000000,
                        lng: Math.round(newLocation.lng * 1000000) / 1000000
                    };
                }
                
                gpsDevicesData[device.deviceId] = device;
            });
        }
        
        updateVehicleList();
        updateMapMarkers();
        updateTraceToggles(); // Update trace toggles for all devices
        // Update open InfoWindow with latest data (real-time) - fire and forget
        updateOpenInfoWindow().catch(err => console.warn('InfoWindow update error:', err));
    } catch (error) {
        console.error('Error loading vehicles:', error);
        const vehicleListEl = document.getElementById('vehicleList');
        if (vehicleListEl) {
            vehicleListEl.innerHTML = '<p class="text-danger">Error loading vehicles</p>';
        }
    }
}

