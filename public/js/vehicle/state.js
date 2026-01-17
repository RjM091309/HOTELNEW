// ========================================
// SHARED STATE - Vehicle Monitoring
// ========================================
// This module exports shared state that all other modules need

export let map = null;
export let markers = {};
export let vehicleData = {};
export let gpsDevicesData = {};
export let isFirstMapLoad = true;
export let currentInfoWindow = null;
export let infoWindows = {};
export let previousGpsDeviceIds = {};
export let lastSavedLocations = {};
export let lastMovementTime = {};
export let lastVehicleBatteryLevels = {};
export let lastGpsBatteryLevels = {};
export let lastVehicleChargingState = {};
export let lastGpsChargingState = {};
export let markerAnimations = {};
export let polylines = {};
export let vehiclePaths = {};
export let traceEnabled = {};
export let traceToggles = {};
// Track last Socket.IO update time to prevent database from overwriting real-time data
export let lastSocketUpdateTime = {}; // { vehicleId: timestamp } or { deviceId: timestamp }

// Setters for state
export function setMap(newMap) {
    map = newMap;
}

export function setIsFirstMapLoad(value) {
    isFirstMapLoad = value;
}

export function setCurrentInfoWindow(infoWindow) {
    currentInfoWindow = infoWindow;
}

