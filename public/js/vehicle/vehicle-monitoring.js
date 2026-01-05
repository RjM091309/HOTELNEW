// ========================================
// VEHICLE MONITORING - GPS TRACKING
// ========================================

let map;
let markers = {};
let vehicleData = {};
let gpsDevicesData = {};
let isFirstMapLoad = true; // Track if this is the first time loading markers
let currentInfoWindow = null; // Track the currently open InfoWindow
let infoWindows = {}; // Store InfoWindow instances for each marker
let previousGpsDeviceIds = {}; // Track previous GPS Device IDs to detect changes
let lastSavedLocations = {}; // Track last saved location from database for each vehicle (for Socket.IO comparison)
let lastMovementTime = {}; // Track when each vehicle last moved (for auto-stop detection)
let markerAnimations = {}; // Track active marker animations to avoid conflicts
let polylines = {}; // Store polyline objects for each vehicle/device path
let vehiclePaths = {}; // Store path history for each vehicle/device (array of {lat, lng})

// Format date to Philippines timezone (Asia/Manila, UTC+8)
// Note: The `timestamp` field from GPS device is in UTC
function formatDatePH(dateInput) {
    if (!dateInput) return 'N/A';
    try {
        let date;
        let dateString = dateInput;
        
        // If it's already a Date object, convert to string first
        if (dateInput instanceof Date) {
            // If it's a Date object, get the UTC components
            const year = dateInput.getUTCFullYear();
            const month = dateInput.getUTCMonth() + 1;
            const day = dateInput.getUTCDate();
            const hours = dateInput.getUTCHours();
            const minutes = dateInput.getUTCMinutes();
            const seconds = dateInput.getUTCSeconds();
            
            // Create UTC date from these components
            date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        }
        // Handle string formats
        else if (typeof dateInput === 'string') {
            // ISO format with Z (UTC): '2026-01-03T00:08:19.000Z' - already UTC, parse directly
            if (dateString.includes('T') && dateString.includes('Z')) {
                date = new Date(dateString);
            }
            // MySQL datetime format: 'YYYY-MM-DD HH:mm:ss' - this is UTC from GPS device
            else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
                // Parse the date components manually and create UTC date
                const [datePart, timePart] = dateString.split(' ');
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes, seconds] = timePart.split(':').map(Number);
                
                // Create UTC date using Date.UTC()
                date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
            }
            // ISO format without timezone: 'YYYY-MM-DDTHH:mm:ss' - treat as UTC
            else if (dateString.includes('T') && !dateString.match(/[+-]\d{2}:\d{2}$/)) {
                date = new Date(dateString + 'Z');
            }
            // ISO format with timezone offset
            else if (dateString.includes('T') && dateString.match(/[+-]\d{2}:\d{2}$/)) {
                date = new Date(dateString);
            }
            // Other string formats - try to parse
            else {
                date = new Date(dateString);
            }
        }
        // Other types - try to convert
        else {
            date = new Date(dateInput);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.error('Invalid date:', dateInput, typeof dateInput);
            return 'N/A';
        }
        
        // Format to Philippines timezone using timeZone option
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        const formatted = formatter.format(date);
        
        return formatted;
    } catch (error) {
        console.error('Error formatting date:', error, dateInput);
        return 'N/A';
    }
}

// Format date to Philippines timezone (full format)
function formatDateFullPH(dateInput) {
    if (!dateInput) return 'N/A';
    try {
        let date;
        
        // If it's already a Date object, convert to string first
        if (dateInput instanceof Date) {
            // If it's a Date object, get the UTC components
            const year = dateInput.getUTCFullYear();
            const month = dateInput.getUTCMonth() + 1;
            const day = dateInput.getUTCDate();
            const hours = dateInput.getUTCHours();
            const minutes = dateInput.getUTCMinutes();
            const seconds = dateInput.getUTCSeconds();
            
            // Create UTC date from these components
            date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        }
        // Handle string formats
        else if (typeof dateInput === 'string') {
            // MySQL datetime format: 'YYYY-MM-DD HH:mm:ss' - this is UTC from GPS device
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateInput)) {
                // Parse the date components manually and create UTC date
                const [datePart, timePart] = dateInput.split(' ');
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes, seconds] = timePart.split(':').map(Number);
                
                // Create UTC date using Date.UTC()
                date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
            }
            // ISO format: try to parse as UTC
            else if (dateInput.includes('T')) {
                if (dateInput.includes('Z')) {
                    date = new Date(dateInput);
                } else if (!dateInput.match(/[+-]\d{2}:\d{2}$/)) {
                    date = new Date(dateInput + 'Z');
                } else {
                    date = new Date(dateInput);
                }
            }
            // Other string formats
            else {
                date = new Date(dateInput);
            }
        }
        // Other types
        else {
            date = new Date(dateInput);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.error('Invalid date:', dateInput);
            return 'N/A';
        }
        
        // Format to Philippines timezone using timeZone option - include date and time
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        const formatted = formatter.format(date);
        
        return formatted;
    } catch (error) {
        console.error('Error formatting date:', error, dateInput);
        return 'N/A';
    }
}

// Initialize Google Maps
async function initMap() {
    try {
        // Get Google Maps API key
        const apiKeyResponse = await fetch('/api/maps/api-key');
        const apiKeyData = await apiKeyResponse.json();
        
        if (!apiKeyData.success || !apiKeyData.apiKey) {
            console.error('Google Maps API key not found');
            const mapDiv = document.getElementById('map');
            if (mapDiv) {
                const loadingDiv = document.getElementById('mapLoading');
                if (loadingDiv) {
                    loadingDiv.remove();
                }
                mapDiv.innerHTML = '<div class="alert alert-danger">Google Maps API key is not configured. Please set VITE_GOOGLE_MAPS_API_KEY in environment variables.</div>';
            }
            return;
        }
        
        // Load Google Maps script
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKeyData.apiKey}&libraries=places&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            // Wait a bit to ensure google.maps is fully loaded
            setTimeout(async () => {
                // Check if google.maps is available
                if (typeof google === 'undefined' || typeof google.maps === 'undefined' || typeof google.maps.Map === 'undefined') {
                    console.error('Google Maps API not loaded properly');
                    const mapDiv = document.getElementById('map');
                    if (mapDiv) {
                        mapDiv.innerHTML = '<div class="alert alert-danger">Google Maps API failed to load. Please refresh the page.</div>';
                    }
                    return;
                }
                
                // Check if map div exists
                const mapDiv = document.getElementById('map');
                if (!mapDiv) {
                    console.error('Map div not found');
                    return;
                }
                
                try {
                    // Remove loading message
                    const loadingDiv = document.getElementById('mapLoading');
                    if (loadingDiv) {
                        loadingDiv.remove();
                    }
                    
                    // Ensure map div is properly styled for Google Maps
                    mapDiv.style.width = '100%';
                    mapDiv.style.height = '600px';
                    
                    // Load vehicles first to calculate proper center
                    await loadVehiclesForMapInit();
                    
                    // Calculate center from vehicle locations, or use default
                    let mapCenter = { lat: 14.5995, lng: 120.9842 }; // Default to Manila
                    let mapZoom = 9;
                    
                    // If we have vehicles with locations, calculate center from them
                    const allLocations = [];
                    Object.values(vehicleData).forEach(vehicle => {
                        if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
                            allLocations.push({ lat: vehicle.location.lat, lng: vehicle.location.lng });
                        }
                    });
                    Object.values(gpsDevicesData).forEach(device => {
                        if (!device.isAssigned && device.location && device.location.lat && device.location.lng) {
                            allLocations.push({ lat: device.location.lat, lng: device.location.lng });
                        }
                    });
                    
                    if (allLocations.length > 0) {
                        // Calculate center from all locations
                        const avgLat = allLocations.reduce((sum, loc) => sum + loc.lat, 0) / allLocations.length;
                        const avgLng = allLocations.reduce((sum, loc) => sum + loc.lng, 0) / allLocations.length;
                        mapCenter = { lat: avgLat, lng: avgLng };
                    }
                    
                    // Initialize map after script loads with calculated center
                    map = new google.maps.Map(mapDiv, {
                        center: mapCenter,
                        zoom: mapZoom,
                        mapTypeId: 'roadmap',
                        fullscreenControl: true,
                        mapTypeControl: true,
                        streetViewControl: true,
                        zoomControl: true
                    });
                    
                    // Listen for map type changes to update label colors
                    google.maps.event.addListener(map, 'maptypeid_changed', () => {
                        updateMarkerLabelColors();
                    });
                    
                    // Close InfoWindow when clicking on the map
                    google.maps.event.addListener(map, 'click', () => {
                        if (currentInfoWindow) {
                            currentInfoWindow.close();
                            currentInfoWindow = null;
                        }
                    });
                    
                    // Update vehicle list and map with markers (vehicles already loaded)
                    updateVehicleList();
                    updateMapMarkers();
                } catch (error) {
                    console.error('Error creating map:', error);
                    const mapDiv = document.getElementById('map');
                    if (mapDiv) {
                        mapDiv.innerHTML = '<div class="alert alert-danger">Error creating map: ' + error.message + '</div>';
                    }
                }
            }, 100); // Small delay to ensure API is ready
        };
        
        script.onerror = () => {
            console.error('Failed to load Google Maps script');
            const mapDiv = document.getElementById('map');
            if (mapDiv) {
                mapDiv.innerHTML = '<div class="alert alert-danger">Failed to load Google Maps. Please check your internet connection and API key.</div>';
            }
        };
        document.head.appendChild(script);
    } catch (error) {
        console.error('Error initializing map:', error);
        document.getElementById('map').innerHTML = '<div class="alert alert-danger">Error loading map. Please check your Google Maps API key.</div>';
    }
}

// Load vehicles data for map initialization (without updating UI)
async function loadVehiclesForMapInit() {
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
                });
            }
            
            vehicleData = {};
            vehiclesData.data.forEach(vehicle => {
                vehicleData[vehicle.id] = vehicle;
            });
        }
        
        if (gpsData.success) {
            gpsDevicesData = {};
            gpsData.data.forEach(device => {
                gpsDevicesData[device.deviceId] = device;
            });
        }
    } catch (error) {
        console.error('Error loading vehicles for map init:', error);
    }
}

// Load vehicles with GPS location
async function loadVehicles() {
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
                        
                        vehicle.location = null; // Clear location for new device
                        vehicle.isOnline = false; // Mark as offline until new device sends data
                    }
                }
                
                // Update previous GPS Device ID
                previousGpsDeviceIds[vehicleId] = currentGpsId;
            });
            
            // Update vehicleData with fresh data and determine isMoving based on position changes
            vehicleData = {};
            vehiclesData.data.forEach(vehicle => {
                // Compare new database position with previous lastSavedLocation to determine if moving
                const newLocation = vehicle.location && vehicle.location.lat && vehicle.location.lng ? {
                    lat: vehicle.location.lat,
                    lng: vehicle.location.lng
                } : null;
                
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
            gpsDevicesData = {};
            gpsData.data.forEach(device => {
                gpsDevicesData[device.deviceId] = device;
            });
        }
        
        updateVehicleList();
        updateMapMarkers();
    } catch (error) {
        console.error('Error loading vehicles:', error);
        document.getElementById('vehicleList').innerHTML = '<p class="text-danger">Error loading vehicles</p>';
    }
}

// Update vehicle list
function updateVehicleList() {
    const vehicleList = document.getElementById('vehicleList');
    let vehicles = Object.values(vehicleData);
    let gpsDevices = Object.values(gpsDevicesData);
    
    if (vehicles.length === 0 && gpsDevices.length === 0) {
        vehicleList.innerHTML = `
            <div class="vehicle-empty-state">
                <i class="fa fa-car" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem; display: block;"></i>
                <p class="text-center text-muted" style="margin: 0;">No vehicles or GPS devices found</p>
            </div>
        `;
        return;
    }
    
    // Sort vehicles: Online first, then Offline, then No GPS
    vehicles.sort((a, b) => {
        const aHasLocation = a.location !== null;
        const bHasLocation = b.location !== null;
        
        // Online vehicles first
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        
        // If both online or both offline, sort by online status
        if (a.isOnline === b.isOnline) {
            // If both online, sort by last update time (most recent first)
            if (a.isOnline && b.isOnline) {
                const aTime = a.location?.lastUpdate ? new Date(a.location.lastUpdate).getTime() : 0;
                const bTime = b.location?.lastUpdate ? new Date(b.location.lastUpdate).getTime() : 0;
                return bTime - aTime;
            }
            // If both offline, offline with location comes before no location
            if (aHasLocation && !bHasLocation) return -1;
            if (!aHasLocation && bHasLocation) return 1;
        }
        
        // Default: maintain original order
        return 0;
    });
    
    // Sort GPS devices: Online first, then Offline
    gpsDevices.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return 0;
    });
    
    // Modern card-based design
    let html = '<div class="vehicle-list-container">';
    
    // Show vehicles with GPS
    vehicles.forEach(vehicle => {
        const hasLocation = vehicle.location !== null;
        const statusClass = vehicle.isOnline ? 'success' : (hasLocation ? 'warning' : 'secondary');
        const statusText = vehicle.isOnline ? 'Online' : (hasLocation ? 'Offline' : 'No GPS');
        const statusIcon = vehicle.isOnline ? 'fa-circle' : (hasLocation ? 'fa-circle-o' : 'fa-times-circle');
        const statusColor = vehicle.isOnline ? '#28a745' : (hasLocation ? '#ffc107' : '#6c757d');
        
        html += `
            <div class="vehicle-card vehicle-item" data-vehicle-id="${vehicle.id}" data-type="vehicle">
                <div class="vehicle-card-header">
                    <div class="vehicle-title-section">
                        <h6 class="vehicle-name">${vehicle.modelName}</h6>
                        <span class="vehicle-plate">${vehicle.plateNumber}</span>
                    </div>
                    <div class="vehicle-status-badge">
                        <span class="badge bg-${statusClass} ${vehicle.isOnline ? 'status-online' : ''}">${statusText}</span>
                    </div>
                </div>
                <div class="vehicle-card-body">
                    <div class="vehicle-info-row">
                        <i class="fa fa-car"></i>
                        <span class="vehicle-type">${vehicle.vehicleType}</span>
                    </div>
                    <div class="vehicle-info-row">
                        <i class="fa fa-satellite"></i>
                        <span class="gps-info">${vehicle.gpsDeviceId || 'Not assigned'}</span>
                    </div>
                    ${hasLocation ? `
                        <div class="vehicle-info-row location-info">
                            <i class="fa fa-map-marker text-primary"></i>
                            <div class="location-details">
                                <span class="location-time">${formatDatePH(vehicle.location.lastUpdate)}</span>
                                ${vehicle.location.minutesSinceUpdate !== null ? `<span class="location-ago">${vehicle.location.minutesSinceUpdate} min ago</span>` : ''}
                            </div>
                        </div>
                    ` : vehicle.hasGps ? `
                        <div class="vehicle-info-row">
                            <i class="fa fa-clock-o text-warning"></i>
                            <span class="text-warning">Waiting for GPS data...</span>
                        </div>
                    ` : `
                        <div class="vehicle-info-row">
                            <i class="fa fa-exclamation-triangle text-muted"></i>
                            <span class="text-muted">No GPS device assigned</span>
                        </div>
                    `}
                </div>
            </div>
        `;
    });
    
    // Show unassigned GPS devices
    gpsDevices.forEach(device => {
        if (!device.isAssigned && device.location) {
            const statusClass = device.isOnline ? 'success' : 'warning';
            const statusText = device.isOnline ? 'Online' : 'Offline';
            const statusColor = device.isOnline ? '#28a745' : '#ffc107';
            
            html += `
                <div class="vehicle-card gps-device-item" data-device-id="${device.deviceId}" data-type="gps">
                    <div class="vehicle-card-header">
                        <div class="vehicle-title-section">
                            <h6 class="vehicle-name"><i class="fa fa-map-marker"></i> GPS Device</h6>
                            <span class="vehicle-plate">${device.deviceId}</span>
                        </div>
                        <div class="vehicle-status-badge">
                            <span class="status-indicator" style="background-color: ${statusColor};"></span>
                            <span class="badge bg-${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    <div class="vehicle-card-body">
                        <div class="vehicle-info-row">
                            <i class="fa fa-exclamation-triangle text-warning"></i>
                            <span class="text-warning">Not assigned to vehicle</span>
                        </div>
                        ${device.location ? `
                            <div class="vehicle-info-row location-info">
                                <i class="fa fa-map-marker text-primary"></i>
                                <div class="location-details">
                                    <span class="location-time">${formatDatePH(device.location.lastUpdate || device.location.createdAt)}</span>
                                    ${device.location.minutesSinceUpdate !== null && device.location.minutesSinceUpdate !== undefined ? `<span class="location-ago">${device.location.minutesSinceUpdate} min ago</span>` : ''}
                                </div>
                            </div>
                        ` : `
                            <div class="vehicle-info-row">
                                <i class="fa fa-times-circle text-muted"></i>
                                <span class="text-muted">No location data</span>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }
    });
    
    html += '</div>';
    vehicleList.innerHTML = html;
    
    // Add click handlers for vehicles
    document.querySelectorAll('.vehicle-item').forEach(item => {
        item.addEventListener('click', function() {
            const vehicleId = this.dataset.vehicleId;
            showVehicleInfo(vehicleId);
            if (markers[vehicleId]) {
                map.setCenter(markers[vehicleId].getPosition());
                map.setZoom(15);
                markers[vehicleId].setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => {
                    if (markers[vehicleId]) {
                        markers[vehicleId].setAnimation(null);
                    }
                }, 2000);
            }
        });
    });
    
    // Add click handlers for GPS devices
    document.querySelectorAll('.gps-device-item').forEach(item => {
        item.addEventListener('click', function() {
            const deviceId = this.dataset.deviceId;
            showGpsDeviceInfo(deviceId);
            if (markers[`gps_${deviceId}`]) {
                map.setCenter(markers[`gps_${deviceId}`].getPosition());
                map.setZoom(15);
                markers[`gps_${deviceId}`].setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => {
                    if (markers[`gps_${deviceId}`]) {
                        markers[`gps_${deviceId}`].setAnimation(null);
                    }
                }, 2000);
            }
        });
    });
}

// Calculate distance in meters between two lat/lng coordinates using Haversine formula
function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Easing function for smooth animation (ease-out cubic)
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Generate a consistent color for a vehicle/device based on ID
function getPathColor(id) {
    const colors = [
        '#FF6B6B', // Red
        '#4ECDC4', // Teal
        '#45B7D1', // Blue
        '#FFA07A', // Light Salmon
        '#98D8C8', // Mint
        '#F7DC6F', // Yellow
        '#BB8FCE', // Purple
        '#85C1E2', // Sky Blue
        '#F8B739', // Orange
        '#52BE80', // Green
        '#E74C3C', // Dark Red
        '#3498DB', // Bright Blue
        '#9B59B6', // Dark Purple
        '#1ABC9C', // Turquoise
        '#F39C12', // Dark Orange
    ];
    // Use ID to get consistent color for same vehicle
    const colorIndex = parseInt(id) % colors.length;
    return colors[colorIndex];
}

// Add point to vehicle path and update polyline
function updateVehiclePath(markerKey, position) {
    if (!map || !position || !position.lat || !position.lng) return;
    
    // Initialize path array if it doesn't exist
    if (!vehiclePaths[markerKey]) {
        vehiclePaths[markerKey] = [];
    }
    
    const path = vehiclePaths[markerKey];
    const pathLength = path.length;
    
    // Add new point to path history if it's far enough from last point (at least 5 meters to avoid too many points)
    let shouldAddToPath = true;
    if (pathLength > 0) {
        const lastPoint = path[pathLength - 1];
        const distance = calculateDistanceMeters(
            lastPoint.lat,
            lastPoint.lng,
            position.lat,
            position.lng
        );
        
        // Only add point to path history if it's at least 5 meters away
        if (distance < 5) {
            shouldAddToPath = false; // Too close, skip adding to path history
        }
    }
    
    // Add new point to path history if distance is sufficient
    if (shouldAddToPath) {
        path.push({ lat: position.lat, lng: position.lng });
        
        // Limit path to last 1000 points to avoid performance issues
        const maxPoints = 1000;
        if (path.length > maxPoints) {
            path.shift(); // Remove oldest point
        }
    }
    
    // Create or update polyline - always ensure last point is exactly at current marker position
    const pathArray = path.map(p => new google.maps.LatLng(p.lat, p.lng));
    
    // Always add current position as the last point to ensure polyline reaches marker
    // This ensures the line is always connected to the marker
    const currentLatLng = new google.maps.LatLng(position.lat, position.lng);
    pathArray.push(currentLatLng);
    
    if (polylines[markerKey]) {
        // Update existing polyline - ensure it's green and path reaches marker
        polylines[markerKey].setPath(pathArray);
        polylines[markerKey].setOptions({
            strokeColor: '#00CC00', // Green color
            strokeOpacity: 0.8
        });
    } else {
        // Create new polyline with green color
        polylines[markerKey] = new google.maps.Polyline({
            path: pathArray,
            geodesic: true,
            strokeColor: '#00CC00', // Green color
            strokeOpacity: 0.8,
            strokeWeight: 3,
            map: map,
            zIndex: 1 // Below markers
        });
    }
}

// Clear path for a vehicle/device
function clearVehiclePath(markerKey) {
    if (polylines[markerKey]) {
        polylines[markerKey].setMap(null);
        delete polylines[markerKey];
    }
    if (vehiclePaths[markerKey]) {
        delete vehiclePaths[markerKey];
    }
}

// Smoothly animate marker from current position to new position
function animateMarkerPosition(marker, newPosition, markerKey = null, duration = 1500) {
    if (!marker || !map) return;
    
    // Find markerKey if not provided
    if (!markerKey) {
        markerKey = Object.keys(markers).find(key => markers[key] === marker);
    }
    
    // Use a fallback key if still not found (shouldn't happen in normal operation)
    if (!markerKey) {
        markerKey = 'unknown_' + Date.now() + '_' + Math.random();
    }
    
    // Cancel any existing animation for this marker
    if (markerAnimations[markerKey]) {
        cancelAnimationFrame(markerAnimations[markerKey].animationId);
        delete markerAnimations[markerKey];
    }
    
    const currentPos = marker.getPosition();
    if (!currentPos) {
        // No current position, just set directly
        marker.setPosition(newPosition);
        return;
    }
    
    const startLat = currentPos.lat();
    const startLng = currentPos.lng();
    const endLat = newPosition.lat;
    const endLng = newPosition.lng;
    
    // Calculate distance to determine duration (longer distance = longer animation, but cap at max)
    const distanceMeters = calculateDistanceMeters(startLat, startLng, endLat, endLng);
    // Adjust duration based on distance: 100m = 1s, 1000m = 2s, but min 0.8s, max 2.5s
    const adjustedDuration = Math.min(Math.max(distanceMeters / 100 * 1000, 800), 2500);
    
    const startTime = performance.now();
    const animationDuration = Math.min(adjustedDuration, duration);
    
    // Store animation state
    const animationState = {
        startTime: startTime,
        duration: animationDuration,
        startLat: startLat,
        startLng: startLng,
        endLat: endLat,
        endLng: endLng,
        animationId: null
    };
    
    markerAnimations[markerKey] = animationState;
    
    function animate(currentTime) {
        if (!markerAnimations[markerKey]) {
            // Animation was cancelled
            return;
        }
        
        const elapsed = currentTime - animationState.startTime;
        const progress = Math.min(elapsed / animationState.duration, 1);
        
        // Apply easing
        const easedProgress = easeOutCubic(progress);
        
        // Interpolate position
        const currentLat = startLat + (endLat - startLat) * easedProgress;
        const currentLng = startLng + (endLng - startLng) * easedProgress;
        
        // Update marker position
        marker.setPosition({ lat: currentLat, lng: currentLng });
        
        if (progress < 1) {
            // Continue animation
            animationState.animationId = requestAnimationFrame(animate);
        } else {
            // Animation complete - ensure final position is exact
            marker.setPosition(newPosition);
            delete markerAnimations[markerKey];
            
            // Update path after animation completes
            updateVehiclePath(markerKey, newPosition);
        }
    }
    
    // Start animation
    animationState.animationId = requestAnimationFrame(animate);
}

// Get marker icon URL based on status (moving, standby, offline)
function getMarkerIconUrl(isOnline, isMoving) {
    if (!isOnline) {
        return '/img/gpsmarker.png'; // Offline
    }
    if (isMoving) {
        return '/img/gpsmarker-2.png'; // Moving
    }
    return '/img/gpsmarker-1.png'; // Standby (online but not moving)
}

// Get label color based on map type
function getLabelColor() {
    if (!map) return '#ffffff';
    const mapType = map.getMapTypeId();
    // White text for all map types (since we have background colors)
    return '#ffffff';
}

// Get label background color based on vehicle/device status
function getLabelBackgroundColor(isMoving, isOnline) {
    if (!isOnline) {
        return 'transparent'; // No background for offline
    }
    if (isMoving) {
        return '#00CC00'; // Green when moving
    }
    return '#0076FF'; // Blue when standby
}

// Get label className based on status
function getLabelClassName(baseClassName, isMoving, isOnline) {
    let className = baseClassName || 'vehicle-marker-label';
    if (!isOnline) {
        className += ' label-offline';
    } else if (isMoving) {
        className += ' label-moving';
    } else {
        className += ' label-standby';
    }
    return className;
}

// Apply background styling to marker label
function applyLabelBackground(marker, isMoving, isOnline) {
    if (!marker) return;
    
    // Get the marker's DOM element
    const markerDiv = marker.getDiv ? marker.getDiv() : null;
    if (!markerDiv) return;
    
    // Find label container - Google Maps labels are in a div with the className
    const labelContainer = markerDiv.querySelector('div[class*="vehicle-marker-label"], div[class*="gps-marker-label"]');
    if (labelContainer) {
        // Determine background color - border and shadow match background color
        let bgColor = 'transparent';
        let borderColor = 'transparent';
        let shadowColor = 'transparent';
        
        if (isOnline) {
            if (isMoving) {
                bgColor = '#00CC00'; // Green when moving
                borderColor = '#00CC00'; // Same as background
                shadowColor = '#00CC00'; // Same as background
            } else {
                bgColor = '#0076FF'; // Blue when standby
                borderColor = '#0076FF'; // Same as background
                shadowColor = '#0076FF'; // Same as background
            }
        }
        
        // Apply styles
        labelContainer.style.backgroundColor = bgColor;
        labelContainer.style.border = `1px solid ${borderColor}`;
        labelContainer.style.borderRadius = '3px';
        labelContainer.style.padding = '2px 6px';
        labelContainer.style.display = 'inline-block';
        labelContainer.style.boxShadow = `0 1px 3px rgba(${hexToRgb(shadowColor)}, 0.3)`;
    }
}

// Helper function to convert hex to rgb for box-shadow
function hexToRgb(hex) {
    if (hex === 'transparent') return '0, 0, 0';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
        '0, 0, 0';
}

// Update all marker label colors based on current map type
function updateMarkerLabelColors() {
    if (!map) return;
    const labelColor = getLabelColor();
    
    // Update all markers
    Object.keys(markers).forEach(markerKey => {
        const marker = markers[markerKey];
        if (!marker) return;
        
        const currentLabel = marker.getLabel();
        if (currentLabel && typeof currentLabel === 'object') {
            // Preserve all label properties, only update color
            marker.setLabel({
                text: currentLabel.text || '',
                color: labelColor,
                fontSize: currentLabel.fontSize || '11px',
                fontWeight: currentLabel.fontWeight || 'bold',
                className: currentLabel.className || ''
            });
        }
    });
}

// Update map markers
function updateMapMarkers() {
    if (!map) return;
    
    // Only use DROP animation on first load
    const useDropAnimation = isFirstMapLoad;
    
    // Remove old markers only if this is a full refresh
    if (isFirstMapLoad) {
        // Cancel all active animations
        Object.keys(markerAnimations).forEach(key => {
            if (markerAnimations[key] && markerAnimations[key].animationId) {
                cancelAnimationFrame(markerAnimations[key].animationId);
            }
        });
        markerAnimations = {};
        
        // Clear all polylines
        Object.keys(polylines).forEach(key => {
            if (polylines[key]) {
                polylines[key].setMap(null);
            }
        });
        polylines = {};
        vehiclePaths = {};
        
        Object.values(markers).forEach(marker => marker.setMap(null));
        markers = {};
    }
    
    // Add vehicle markers
    Object.values(vehicleData).forEach(vehicle => {
        if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
            const position = { lat: vehicle.location.lat, lng: vehicle.location.lng };
            
            // Check if marker already exists
            if (markers[vehicle.id]) {
                // isMoving is already determined in loadVehicles() by comparing with previous lastSavedLocations
                // IMPORTANT: Only update marker position if vehicle.isMoving is true (database location actually changed)
                // Don't compare marker position vs database position - rely on isMoving flag from database comparison
                // This ensures marker only moves when database location actually changed (saved to database)
                
                // Only update marker position if vehicle is moving (database location changed >= 10m)
                // If isMoving is false, database location is the same (server didn't save, vehicle not moving)
                if (vehicle.isMoving) {
                    // Double-check: compare with marker's current position to avoid unnecessary updates
                    const currentPos = markers[vehicle.id].getPosition();
                    let shouldUpdatePosition = false;
                    
                    if (!currentPos) {
                        shouldUpdatePosition = true;
                    } else {
                        // Round coordinates to 6 decimal places (~0.1m precision) to avoid floating point issues
                        const roundCoord = (coord) => Math.round(coord * 1000000) / 1000000;
                        const roundedCurrentLat = roundCoord(currentPos.lat());
                        const roundedCurrentLng = roundCoord(currentPos.lng());
                        const roundedNewLat = roundCoord(position.lat);
                        const roundedNewLng = roundCoord(position.lng);
                        
                        // Only update if coordinates are actually different (accounting for floating point precision)
                        if (roundedCurrentLat !== roundedNewLat || roundedCurrentLng !== roundedNewLng) {
                            const distanceMeters = calculateDistanceMeters(
                                roundedCurrentLat,
                                roundedCurrentLng,
                                roundedNewLat,
                                roundedNewLng
                            );
                            const distanceThreshold = 5; // 5 meters - only update if actually moved
                            shouldUpdatePosition = distanceMeters >= distanceThreshold;
                        }
                    }
                    
                    // Only animate marker if position actually changed AND vehicle is moving
                    if (shouldUpdatePosition) {
                        console.log(`📍 Moving marker for vehicle ${vehicle.id || vehicle.plateNumber || 'unknown'}: isMoving = ${vehicle.isMoving}, position changed`);
                        animateMarkerPosition(markers[vehicle.id], position, vehicle.id);
                        // Path will be updated when animation completes
                    } else if (vehicle.isMoving) {
                        console.log(`📍 Vehicle ${vehicle.id || vehicle.plateNumber || 'unknown'}: isMoving = true but marker position didn't change (already at correct position)`);
                    }
                } else {
                    // vehicle.isMoving = false means no actual movement in database (device didn't move >= 10m)
                    // Marker correctly stays still - this is expected behavior
                    // No need to log every refresh - only log if there's confusion
                }
                
                // Always update icon based on isMoving status (to show correct icon even if position didn't change)
                const currentIconUrl = markers[vehicle.id].getIcon()?.url || '';
                const newIconUrl = getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false);
                const iconChanged = currentIconUrl !== newIconUrl;
                
                // Always update icon/label if status changed (to reflect isMoving change)
                // Update icon/label if moving status changed, but don't move marker if not actually moving
                if (iconChanged) {
                    const iconUrl = getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false);
                    markers[vehicle.id].setIcon({
                        url: iconUrl,
                        scaledSize: new google.maps.Size(48, 48),
                        labelOrigin: new google.maps.Point(24, 60)
                    });
                    markers[vehicle.id].setLabel({
                        text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                        color: '#FFFFFF', // White text
                        fontSize: '11px',
                        fontWeight: 'bold',
                        className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
                    });
                    
                    // Apply background styling
                    applyLabelBackground(markers[vehicle.id], vehicle.isMoving || false, vehicle.isOnline);
                }
                return; // Skip creating new marker
            }
            
            // Create marker with label below (only for new markers)
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `${vehicle.modelName} - ${vehicle.plateNumber}`,
                label: {
                    text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                    color: '#FFFFFF', // White text
                    fontSize: '11px',
                    fontWeight: 'bold',
                    className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
                },
                icon: {
                    url: getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false),
                    scaledSize: new google.maps.Size(48, 48),
                    labelOrigin: new google.maps.Point(24, 60) // Position label below marker
                },
                animation: useDropAnimation ? google.maps.Animation.DROP : null
            });
            
            // Add background styling to label after marker is created
            setTimeout(() => {
                applyLabelBackground(marker, vehicle.isMoving || false, vehicle.isOnline);
            }, 100);
            
            // Create info window using helper function
            const infoWindow = new google.maps.InfoWindow({
                content: generateVehicleInfoWindowContent(vehicle)
            });
            
            // Listen for InfoWindow close event
            google.maps.event.addListener(infoWindow, 'closeclick', () => {
                if (currentInfoWindow === infoWindow) {
                    currentInfoWindow = null;
                }
            });
            
            marker.addListener('click', () => {
                // Close any previously open InfoWindow
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                currentInfoWindow = infoWindow;
                infoWindow.open(map, marker);
            });
            
            // Store InfoWindow for this vehicle
            infoWindows[vehicle.id] = infoWindow;
            markers[vehicle.id] = marker;
            
            // Apply background styling to label
            setTimeout(() => {
                applyLabelBackground(marker, vehicle.isMoving || false, vehicle.isOnline);
            }, 100);
            
            // Initialize path with current position if it doesn't exist
            if (!vehiclePaths[vehicle.id]) {
                updateVehiclePath(vehicle.id, position);
            }
        }
    });
    
    // Remove GPS device markers that are now assigned to vehicles
    Object.keys(markers).forEach(markerKey => {
        if (markerKey.startsWith('gps_')) {
            const deviceId = markerKey.replace('gps_', '');
            // Check if this device is now assigned to a vehicle
            const isAssignedToVehicle = Object.values(vehicleData).some(vehicle => 
                vehicle.gpsDeviceId === deviceId
            );
            if (isAssignedToVehicle) {
                // Cancel animation for this marker if active
                if (markerAnimations[markerKey] && markerAnimations[markerKey].animationId) {
                    cancelAnimationFrame(markerAnimations[markerKey].animationId);
                    delete markerAnimations[markerKey];
                }
                
                // Clear path for GPS device (it's now tracked as vehicle)
                clearVehiclePath(markerKey);
                
                // Remove GPS device marker - it's now shown as vehicle marker
                markers[markerKey].setMap(null);
                delete markers[markerKey];
                if (infoWindows[markerKey]) {
                    delete infoWindows[markerKey];
                }
            }
        }
    });
    
    // Add GPS device markers (unassigned devices only)
    Object.values(gpsDevicesData).forEach(device => {
        if (!device.isAssigned && device.location && device.location.lat && device.location.lng) {
            const position = { lat: device.location.lat, lng: device.location.lng };
            const markerKey = `gps_${device.deviceId}`;
            
            // Check if marker already exists
            if (markers[markerKey]) {
                // IMPORTANT: Only update marker position if position actually changed significantly (>= 10m)
                // Round coordinates to 6 decimal places (~0.1m precision) to avoid floating point issues
                const roundCoord = (coord) => Math.round(coord * 1000000) / 1000000;
                
                const currentPos = markers[markerKey].getPosition();
                let positionChanged = false;
                
                if (!currentPos) {
                    positionChanged = true;
                } else {
                    // Round coordinates to avoid floating point precision issues
                    const roundedCurrentLat = roundCoord(currentPos.lat());
                    const roundedCurrentLng = roundCoord(currentPos.lng());
                    const roundedNewLat = roundCoord(position.lat);
                    const roundedNewLng = roundCoord(position.lng);
                    
                    // Only update if coordinates are actually different (accounting for floating point precision)
                    if (roundedCurrentLat !== roundedNewLat || roundedCurrentLng !== roundedNewLng) {
                        const deviceDistanceMeters = calculateDistanceMeters(
                            roundedCurrentLat,
                            roundedCurrentLng,
                            roundedNewLat,
                            roundedNewLng
                        );
                        const deviceDistanceThreshold = 10; // Same as server threshold (10 meters)
                        // Only update if movement is >= 10m (actual movement in database)
                        positionChanged = deviceDistanceMeters >= deviceDistanceThreshold;
                    } else {
                        // Coordinates are the same (within floating point precision) - no change
                        positionChanged = false;
                    }
                }
                
                // Only update marker position if it actually changed significantly (>= 10m)
                // This ensures marker only moves when database location actually changed (saved to database)
                if (positionChanged) {
                    animateMarkerPosition(markers[markerKey], position, markerKey);
                    // Path will be updated when animation completes
                }
                
                // Check if icon/status changed (for non-position updates)
                const wasDeviceOnline = markers[markerKey].getIcon()?.url?.includes('gpsmarker-1.png') || false;
                const deviceIconChanged = wasDeviceOnline !== device.isOnline;
                
                // Only update icon/label if position changed OR status changed
                if (positionChanged || deviceIconChanged) {
                    const iconUrl = getMarkerIconUrl(device.isOnline, device.isMoving || false);
                    markers[markerKey].setIcon({
                        url: iconUrl,
                        scaledSize: new google.maps.Size(40, 40),
                        labelOrigin: new google.maps.Point(20, 55)
                    });
                    markers[markerKey].setLabel({
                        text: device.deviceId.substring(device.deviceId.length - 4) || 'GPS',
                        color: '#FFFFFF', // White text
                        fontSize: '10px',
                        fontWeight: 'bold',
                        className: getLabelClassName('gps-marker-label', device.isMoving || false, device.isOnline)
                    });
                    
                    // Apply background styling
                    setTimeout(() => {
                        applyLabelBackground(markers[markerKey], device.isMoving || false, device.isOnline);
                    }, 50);
                }
                return; // Skip creating new marker
            }
            
            // Create marker for unassigned GPS device with label below (only for new markers)
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `GPS Device ${device.deviceId} (Unassigned)`,
                label: {
                    text: device.deviceId.substring(device.deviceId.length - 4) || 'GPS',
                    color: '#FFFFFF', // White text
                    fontSize: '10px',
                    fontWeight: 'bold',
                    className: getLabelClassName('gps-marker-label', device.isMoving || false, device.isOnline)
                },
                icon: {
                    url: device.isOnline ? '/img/gpsmarker-1.png' : '/img/gpsmarker.png',
                    scaledSize: new google.maps.Size(40, 40),
                    labelOrigin: new google.maps.Point(20, 55) // Position label below marker
                },
                animation: useDropAnimation ? google.maps.Animation.DROP : null
            });
            
            // Create info window
            const infoWindowId = `infoWindow_gps_${device.deviceId}`;
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div id="${infoWindowId}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 280px; max-width: 320px; border: none; box-shadow: none;">
                        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 14px 16px; margin: -8px -8px 0 -8px; border-radius: 8px 8px 0 0;">
                            <h4 style="margin: 0; color: #fff; font-size: 17px; font-weight: 600; letter-spacing: 0.3px;">📍 GPS Device</h4>
                        </div>
                        <div style="padding: 12px 16px; background: #fff;">
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Device ID:</span>
                                <span style="color: #111827; font-size: 13px; font-family: 'Courier New', monospace; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${device.deviceId}</span>
                            </div>
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Status:</span>
                                <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">Not Assigned</span>
                            </div>
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">GPS Status:</span>
                                <span style="color: ${device.isOnline ? '#10b981' : '#f59e0b'}; font-weight: 600; font-size: 14px;">${device.isOnline ? '● Online' : '● Offline'}</span>
                            </div>
                            ${device.location.speed ? `
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                                <span style="color: #111827; font-size: 14px;">${device.location.speed} km/h</span>
                            </div>
                            ` : ''}
                            ${device.location.battery ? `
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                                <span style="color: #111827; font-size: 14px;">${device.location.battery}%</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Last Update:</span>
                                <span style="color: #111827; font-size: 12px;">${formatDateFullPH(device.location.lastUpdate || device.location.createdAt)}</span>
                            </div>
                        </div>
                        <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                            <button onclick="showGpsDeviceInfo('${device.deviceId}')" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
                        </div>
                    </div>
                `
            });
            
            // Listen for InfoWindow close event
            google.maps.event.addListener(infoWindow, 'closeclick', () => {
                if (currentInfoWindow === infoWindow) {
                    currentInfoWindow = null;
                }
            });
            
            marker.addListener('click', () => {
                // Close any previously open InfoWindow
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                currentInfoWindow = infoWindow;
                infoWindow.open(map, marker);
            });
            
            markers[`gps_${device.deviceId}`] = marker;
            
            // Apply background styling to label
            setTimeout(() => {
                applyLabelBackground(marker, device.isMoving || false, device.isOnline);
            }, 100);
            
            // Initialize path with current position if it doesn't exist
            if (!vehiclePaths[markerKey]) {
                updateVehiclePath(markerKey, position);
            }
        }
    });
    
    // Fit map to show all markers (only on first load to avoid jumping)
    if (isFirstMapLoad && Object.keys(markers).length > 0) {
        const bounds = new google.maps.LatLngBounds();
        Object.values(markers).forEach(marker => {
            bounds.extend(marker.getPosition());
        });
        // Add moderate padding to show area around markers (top, right, bottom, left in pixels)
        map.fitBounds(bounds, { top: 120, right: 120, bottom: 120, left: 120 });
        
        // Set maximum zoom level to prevent too much zoom in
        google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            if (map.getZoom() > 17) {
                map.setZoom(17);
            }
        });
        
        isFirstMapLoad = false; // Mark that first load is complete
    }
}

// Show vehicle information
function showVehicleInfo(vehicleId) {
    const vehicle = vehicleData[vehicleId];
    if (!vehicle) return;
    
    const content = document.getElementById('vehicleInfoContent');
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Vehicle Details</h6>
                <p><strong>Model:</strong> ${vehicle.modelName}</p>
                <p><strong>Plate Number:</strong> ${vehicle.plateNumber}</p>
                <p><strong>Type:</strong> ${vehicle.vehicleType}</p>
                <p><strong>Color:</strong> ${vehicle.color}</p>
                <p><strong>GPS Device ID:</strong> ${vehicle.gpsDeviceId || 'Not assigned'}</p>
            </div>
            <div class="col-md-6">
                <h6>Location Information</h6>
                ${vehicle.location ? `
                    <p><strong>Status:</strong> <span class="badge bg-${vehicle.isOnline ? 'success' : 'warning'}">${vehicle.isOnline ? 'Online' : 'Offline'}</span></p>
                    <p><strong>Coordinates:</strong> ${vehicle.location.lat.toFixed(6)}, ${vehicle.location.lng.toFixed(6)}</p>
                    ${vehicle.location.speed ? `<p><strong>Speed:</strong> ${vehicle.location.speed} km/h</p>` : ''}
                    ${vehicle.location.heading ? `<p><strong>Heading:</strong> ${vehicle.location.heading}°</p>` : ''}
                    ${vehicle.location.battery ? `<p><strong>Battery:</strong> ${vehicle.location.battery}%</p>` : ''}
                    <p><strong>Last Update:</strong> ${formatDateFullPH(vehicle.location.lastUpdate)}</p>
                    <p><strong>Minutes Since Update:</strong> ${vehicle.location.minutesSinceUpdate !== null ? vehicle.location.minutesSinceUpdate : 'N/A'}</p>
                ` : '<p class="text-muted">No location data available</p>'}
            </div>
        </div>
    `;
    
    // Store vehicle ID for history button
    document.getElementById('viewHistoryBtn').onclick = () => {
        window.location.href = `/vehicle/monitoring?vehicle=${vehicleId}`;
    };
    
    const modal = new bootstrap.Modal(document.getElementById('vehicleInfoModal'));
    modal.show();
}

// Show GPS device information
function showGpsDeviceInfo(deviceId) {
    const device = gpsDevicesData[deviceId];
    if (!device) return;
    
    const content = document.getElementById('vehicleInfoContent');
    content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>GPS Device Details</h6>
                <p><strong>Device ID:</strong> ${device.deviceId}</p>
                <p><strong>Status:</strong> <span class="badge bg-${device.isAssigned ? 'success' : 'warning'}">${device.isAssigned ? 'Assigned' : 'Not Assigned'}</span></p>
                ${device.vehicle ? `
                    <p><strong>Assigned Vehicle:</strong> ${device.vehicle.modelName} (${device.vehicle.plateNumber})</p>
                ` : '<p class="text-warning"><strong>Not assigned to any vehicle</strong></p>'}
                <p><strong>Total Updates:</strong> ${device.totalUpdates || 0}</p>
            </div>
            <div class="col-md-6">
                <h6>Location Information</h6>
                ${device.location ? `
                    <p><strong>GPS Status:</strong> <span class="badge bg-${device.isOnline ? 'success' : 'warning'}">${device.isOnline ? 'Online' : 'Offline'}</span></p>
                    <p><strong>Coordinates:</strong> ${device.location.lat.toFixed(6)}, ${device.location.lng.toFixed(6)}</p>
                    ${device.location.speed ? `<p><strong>Speed:</strong> ${device.location.speed} km/h</p>` : ''}
                    ${device.location.heading ? `<p><strong>Heading:</strong> ${device.location.heading}°</p>` : ''}
                    ${device.location.battery ? `<p><strong>Battery:</strong> ${device.location.battery}%</p>` : ''}
                    <p><strong>Last Update:</strong> ${formatDateFullPH(device.location.lastUpdate || device.location.createdAt)}</p>
                    ${device.location.minutesSinceUpdate !== null && device.location.minutesSinceUpdate !== undefined ? `<p><strong>Minutes Since Update:</strong> ${device.location.minutesSinceUpdate}</p>` : ''}
                ` : '<p class="text-muted">No location data available</p>'}
            </div>
        </div>
    `;
    
    // Hide history button for unassigned devices
    document.getElementById('viewHistoryBtn').style.display = device.isAssigned ? 'inline-block' : 'none';
    
    if (device.isAssigned && device.vehicle) {
        document.getElementById('viewHistoryBtn').onclick = () => {
            window.location.href = `/vehicle/monitoring?vehicle=${device.vehicle.id}`;
        };
    }
    
    const modal = new bootstrap.Modal(document.getElementById('vehicleInfoModal'));
    modal.show();
}


// ========================================
// SOCKET.IO REAL-TIME GPS UPDATES
// ========================================

let gpsTrackingSocket = null;
let pollingInterval = null;
let isPollingActive = false;

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

// Generate InfoWindow content for a vehicle
function generateVehicleInfoWindowContent(vehicle) {
    return `
        <div id="infoWindow_${vehicle.id}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 280px; max-width: 320px; border: none; box-shadow: none;">
            <div style="background: #ffffff; padding: 14px 16px; margin: -8px -8px 0 -8px; border-radius: 8px 8px 0 0;">
                <h4 style="margin: 0; color: #000; font-size: 17px; font-weight: 600; letter-spacing: 0.3px;">${vehicle.modelName}</h4>
            </div>
            <div style="padding: 12px 16px; background: #fff;">
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Plate Number:</span>
                    <span style="font-weight: 600; color: #111827; font-size: 14px;">${vehicle.plateNumber}</span>
                </div>
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Vehicle Type:</span>
                    <span style="color: #111827; font-size: 14px;">${vehicle.vehicleType}</span>
                </div>
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">GPS Device:</span>
                    <span style="color: #111827; font-size: 13px; font-family: 'Courier New', monospace; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${vehicle.gpsDeviceId || 'Not assigned'}</span>
                </div>
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Status:</span>
                    <span style="color: ${vehicle.isOnline ? '#10b981' : '#f59e0b'}; font-weight: 600; font-size: 14px;">${vehicle.isOnline ? '● Online' : '● Offline'}</span>
                </div>
                ${vehicle.location && vehicle.location.speed ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                    <span style="color: #111827; font-size: 14px;">${vehicle.location.speed} km/h</span>
                </div>
                ` : ''}
                ${vehicle.location && vehicle.location.battery ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                    <span style="color: #111827; font-size: 14px;">${vehicle.location.battery}%</span>
                </div>
                ` : ''}
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Last Update:</span>
                    <span style="color: #111827; font-size: 12px;">${formatDateFullPH(vehicle.location ? vehicle.location.lastUpdate : '')}</span>
                </div>
            </div>
            <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                <button onclick="showVehicleInfo(${vehicle.id})" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
            </div>
        </div>
    `;
}

// Update marker for a specific vehicle
function updateMarkerForVehicle(vehicleId, vehicle) {
    if (!map || !vehicle.location) return;
    
    const position = { lat: vehicle.location.lat, lng: vehicle.location.lng };
    
    if (markers[vehicleId]) {
        // Get current position to check if it changed (use 10-meter threshold, same as server)
        const currentPos = markers[vehicleId].getPosition();
        let positionChanged = false;
        if (!currentPos) {
            positionChanged = true;
        } else {
            const distanceMeters = calculateDistanceMeters(
                currentPos.lat(),
                currentPos.lng(),
                position.lat,
                position.lng
            );
            const distanceThreshold = 10; // Same as server threshold (10 meters)
            positionChanged = distanceMeters >= distanceThreshold;
        }
        
        // Check if icon changed (compare current icon URL with new icon URL)
        const currentIconUrl = markers[vehicleId].getIcon()?.url || '';
        const newIconUrl = getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false);
        const iconChanged = currentIconUrl !== newIconUrl;
        
        // Only update marker position if it actually changed
        if (positionChanged) {
            animateMarkerPosition(markers[vehicleId], position, vehicleId);
        }
        
        // Only update icon/label/infowindow if position changed OR status changed
        if (positionChanged || iconChanged) {
            const iconUrl = getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false);
            markers[vehicleId].setIcon({
                url: iconUrl,
                scaledSize: new google.maps.Size(48, 48),
                labelOrigin: new google.maps.Point(24, 60) // Position label below marker
            });
            // Update label text
            markers[vehicleId].setLabel({
                text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                color: '#FFFFFF', // White text
                fontSize: '11px',
                fontWeight: 'bold',
                className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
            });
            
            // Apply background styling
            setTimeout(() => {
                applyLabelBackground(markers[vehicleId], vehicle.isMoving || false, vehicle.isOnline);
            }, 50);
            
            // Update InfoWindow content if it exists and is open
            if (infoWindows[vehicleId]) {
                const newContent = generateVehicleInfoWindowContent(vehicle);
                infoWindows[vehicleId].setContent(newContent);
            }
        }
    } else {
        // Create new marker with label below
        const marker = new google.maps.Marker({
            position: position,
            map: map,
            title: `${vehicle.modelName} - ${vehicle.plateNumber}`,
            label: {
                text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                color: '#FFFFFF', // White text
                fontSize: '11px',
                fontWeight: 'bold',
                className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
            },
            icon: {
                url: getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false),
                scaledSize: new google.maps.Size(48, 48),
                labelOrigin: new google.maps.Point(24, 60) // Position label below marker
            },
            animation: google.maps.Animation.DROP
        });
        
        // Create info window using helper function
        const infoWindow = new google.maps.InfoWindow({
            content: generateVehicleInfoWindowContent(vehicle)
        });
        
        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
        
        markers[vehicleId] = marker;
        
        // Apply background styling to label
        setTimeout(() => {
            applyLabelBackground(marker, vehicle.isMoving || false, vehicle.isOnline);
        }, 100);
    }
}

// Update marker for an unassigned GPS device
function updateMarkerForGpsDevice(deviceId, device) {
    if (!map || !device.location) return;
    
    const position = { lat: device.location.lat, lng: device.location.lng };
    const markerKey = `gps_${deviceId}`;
    
    if (markers[markerKey]) {
        // Get current position to check if it changed (use 10-meter threshold, same as server)
        const currentPos = markers[markerKey].getPosition();
        let devicePositionChanged = false;
        if (!currentPos) {
            devicePositionChanged = true;
        } else {
            const deviceDistanceMeters = calculateDistanceMeters(
                currentPos.lat(),
                currentPos.lng(),
                position.lat,
                position.lng
            );
            const deviceDistanceThreshold = 10; // Same as server threshold (10 meters)
            devicePositionChanged = deviceDistanceMeters >= deviceDistanceThreshold;
        }
        
        // Check if icon changed (compare current icon URL with new icon URL)
        const currentDeviceIconUrl = markers[markerKey].getIcon()?.url || '';
        const newDeviceIconUrl = getMarkerIconUrl(device.isOnline, device.isMoving || false);
        const deviceIconChanged = currentDeviceIconUrl !== newDeviceIconUrl;
        
        // Only update marker position if it actually changed
        if (devicePositionChanged) {
            animateMarkerPosition(markers[markerKey], position, markerKey);
        }
        
        // Only update icon/label if position changed OR status changed
        if (devicePositionChanged || deviceIconChanged) {
            const iconUrl = getMarkerIconUrl(device.isOnline, device.isMoving || false);
            markers[markerKey].setIcon({
                url: iconUrl,
                scaledSize: new google.maps.Size(40, 40),
                labelOrigin: new google.maps.Point(20, 55) // Position label below marker
            });
            // Update label text
            markers[markerKey].setLabel({
                text: deviceId.substring(deviceId.length - 4) || 'GPS',
                color: '#FFFFFF', // White text
                fontSize: '10px',
                fontWeight: 'bold',
                className: getLabelClassName('gps-marker-label', device.isMoving || false, device.isOnline)
            });
            
            // Apply background styling
            setTimeout(() => {
                applyLabelBackground(markers[markerKey], device.isMoving || false, device.isOnline);
            }, 50);
        }
    } else if (!device.isAssigned) {
        // Create new marker for unassigned device with label below
        const marker = new google.maps.Marker({
            position: position,
            map: map,
            title: `GPS Device ${deviceId} (Unassigned)`,
            label: {
                text: deviceId.substring(deviceId.length - 4) || 'GPS',
                color: '#FFFFFF', // White text
                fontSize: '10px',
                fontWeight: 'bold',
                className: getLabelClassName('gps-marker-label', device.isMoving || false, device.isOnline)
            },
            icon: {
                url: getMarkerIconUrl(device.isOnline, device.isMoving || false),
                scaledSize: new google.maps.Size(40, 40),
                labelOrigin: new google.maps.Point(20, 55) // Position label below marker
            },
            animation: google.maps.Animation.DROP
        });
        
        // Create info window
        const infoWindowId = `infoWindow_gps_${deviceId}`;
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div id="${infoWindowId}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 280px; max-width: 320px; border: none; box-shadow: none;">
                    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 14px 16px; margin: -8px -8px 0 -8px; border-radius: 8px 8px 0 0;">
                        <h4 style="margin: 0; color: #fff; font-size: 17px; font-weight: 600; letter-spacing: 0.3px;">📍 GPS Device</h4>
                    </div>
                    <div style="padding: 12px 16px; background: #fff;">
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Device ID:</span>
                            <span style="color: #111827; font-size: 13px; font-family: 'Courier New', monospace; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${deviceId}</span>
                        </div>
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Status:</span>
                            <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">Not Assigned</span>
                        </div>
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">GPS Status:</span>
                            <span style="color: ${device.isOnline ? '#10b981' : '#f59e0b'}; font-weight: 600; font-size: 14px;">${device.isOnline ? '● Online' : '● Offline'}</span>
                        </div>
                        ${device.location.speed ? `
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                            <span style="color: #111827; font-size: 14px;">${device.location.speed} km/h</span>
                        </div>
                        ` : ''}
                        ${device.location.battery ? `
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                            <span style="color: #111827; font-size: 14px;">${device.location.battery}%</span>
                        </div>
                        ` : ''}
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Last Update:</span>
                            <span style="color: #111827; font-size: 12px;">${formatDateFullPH(device.location.lastUpdate || device.location.createdAt)}</span>
                        </div>
                    </div>
                    <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                        <button onclick="showGpsDeviceInfo('${deviceId}')" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
                    </div>
                </div>
            `
        });
        
        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
        
        markers[markerKey] = marker;
        
        // Apply background styling to label
        setTimeout(() => {
            applyLabelBackground(marker, device.isMoving || false, device.isOnline);
        }, 100);
    }
}

// Periodic refresh interval (as backup, even when socket is connected)
let periodicRefreshInterval = null;

// Start periodic refresh (every 30 seconds as backup)
function startPeriodicRefresh() {
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
window.testVehicleMonitoring = function() {
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
    
    // Manually trigger the event handler
    if (gpsTrackingSocket && gpsTrackingSocket.connected) {
        // Emit a test event to see if it's received
        console.log('🧪 [TEST] Emitting test-vehicle-updated event...');
        gpsTrackingSocket.emit('test-vehicle-updated', testEvent);
        
        // Also manually call the handler to test
        console.log('🧪 [TEST] Manually calling vehicle-updated handler...');
        const handler = gpsTrackingSocket._callbacks?.['$vehicle-updated'];
        if (handler) {
            handler.forEach(cb => cb(testEvent));
        } else {
            console.log('🧪 [TEST] Handler not found in _callbacks, trying direct call...');
            // Try to find and call the handler directly
            console.log('🧪 [TEST] Note: This is just for testing. Real events should come from server.');
        }
    }
};

// Initialize Socket.IO - try multiple ways to ensure it runs
function initializeSocketIO() {
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

// Note: initMap() is called from the EJS template after script loads

