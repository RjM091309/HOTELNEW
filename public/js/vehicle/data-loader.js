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
                    // Seed battery baseline for charging detection
                    if (vehicle.location && vehicle.location.battery !== null && vehicle.location.battery !== undefined) {
                        lastVehicleBatteryLevels[vehicle.id] = Number(vehicle.location.battery);
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
                }
                if (vehicle.location) {
                    vehicle.location.isCharging = !!isCharging;
                }
                if (newBattery !== null) {
                    lastVehicleBatteryLevels[vehicle.id] = newBattery;
                    lastVehicleChargingState[vehicle.id] = isCharging;
                }
                
                const previousLocation = lastSavedLocations[vehicle.id];
                
                if (newLocation) {
                    if (!previousLocation) {
                        // First time seeing this location - not moving (just initialized)
                        vehicle.isMoving = false;
                    } else {
                        // Round coordinates to 6 decimal places (~0.1m precision) to avoid floating point issues
                        const roundCoord = (coord) => Math.round(coord * 1000000) / 1000000;
                        const roundedPrevLat = roundCoord(previousLocation.lat);
                        const roundedPrevLng = roundCoord(previousLocation.lng);
                        const roundedNewLat = roundCoord(newLocation.lat);
                        const roundedNewLng = roundCoord(newLocation.lng);
                        
                        // Calculate distance from previous saved location (from last database load)
                        const distanceMeters = calculateDistanceMeters(
                            roundedPrevLat,
                            roundedPrevLng,
                            roundedNewLat,
                            roundedNewLng
                        );
                        
                        const distanceThreshold = 10; // Same as server threshold (10 meters)
                        
                        // Only mark as moving if distance is clearly >= 10m (new saved location)
                        // If distance < 10m, database location is the same (server didn't save, vehicle not moving)
                        vehicle.isMoving = distanceMeters >= distanceThreshold;
                        
                        // Track movement time - if vehicle moved, update timestamp
                        if (vehicle.isMoving) {
                            lastMovementTime[vehicle.id] = Date.now();
                        } else {
                            // If not moving, check if enough time has passed since last movement
                            // Auto-stop after 30 seconds of no new movement
                            const lastMove = lastMovementTime[vehicle.id];
                            if (lastMove) {
                                const timeSinceLastMove = Date.now() - lastMove;
                                const autoStopDelay = 30000; // 30 seconds
                                if (timeSinceLastMove > autoStopDelay) {
                                    vehicle.isMoving = false;
                                    delete lastMovementTime[vehicle.id];
                                }
                            }
                        }
                        
                        // Debug logging
                        if (distanceMeters > 0.1) {
                            console.log(`📍 Vehicle ${vehicle.id || vehicle.plateNumber || 'unknown'}: Distance from DB = ${distanceMeters.toFixed(2)}m, isMoving = ${vehicle.isMoving}`);
                        } else if (distanceMeters > 0) {
                            // Log small movements that don't trigger save (for debugging)
                            console.log(`📍 Vehicle ${vehicle.id || vehicle.plateNumber || 'unknown'}: Small movement ${distanceMeters.toFixed(2)}m (< 10m threshold) - NOT saved to DB, marker stays still`);
                        }
                    }
                    // Always update lastSavedLocations to current database location (for next comparison)
                    // Round coordinates to avoid floating point precision issues
                    lastSavedLocations[vehicle.id] = {
                        lat: Math.round(newLocation.lat * 1000000) / 1000000,
                        lng: Math.round(newLocation.lng * 1000000) / 1000000
                    };
                } else {
                    // No location - not moving
                    vehicle.isMoving = false;
                }
                
                vehicleData[vehicle.id] = vehicle;
            });
        }
        
        if (gpsData.success) {
            // Clear and populate gpsDevicesData
            Object.keys(gpsDevicesData).forEach(key => delete gpsDevicesData[key]);
            gpsData.data.forEach(device => {
                // Charging detection (unassigned GPS device)
                const newBattery = device.location && device.location.battery !== null && device.location.battery !== undefined
                    ? Number(device.location.battery)
                    : null;
                const prevBattery = lastGpsBatteryLevels[device.deviceId];
                let isCharging = false;
                if (prevBattery !== undefined && newBattery !== null) {
                    if (newBattery > prevBattery) {
                        isCharging = true;
                    } else if (newBattery === prevBattery) {
                        isCharging = !!lastGpsChargingState[device.deviceId];
                    } else {
                        isCharging = false;
                    }
                }
                if (device.location) {
                    device.location.isCharging = !!isCharging;
                }
                if (newBattery !== null) {
                    lastGpsBatteryLevels[device.deviceId] = newBattery;
                    lastGpsChargingState[device.deviceId] = isCharging;
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

