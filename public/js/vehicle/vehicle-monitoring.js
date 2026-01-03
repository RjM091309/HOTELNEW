// ========================================
// VEHICLE MONITORING - GPS TRACKING
// ========================================

let map;
let markers = {};
let vehicleData = {};
let gpsDevicesData = {};
let isFirstMapLoad = true; // Track if this is the first time loading markers

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
        
        // Debug logging to see what's happening
        console.log('[formatDatePH] Input:', dateInput, 'Type:', typeof dateInput, '-> Parsed UTC Date:', date.toISOString(), '-> PH Time:', formatted);
        
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
        
        // Debug logging to see what's happening
        console.log('[formatDateFullPH] Input:', dateInput, 'Type:', typeof dateInput, '-> Parsed UTC Date:', date.toISOString(), '-> PH Time:', formatted);
        
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
                    
                    console.log('Map initialized successfully');
                    
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
                                    <span class="location-time">${formatDatePH(device.location.timestamp)}</span>
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

// Get label color based on map type
function getLabelColor() {
    if (!map) return '#333333';
    const mapType = map.getMapTypeId();
    // White text for satellite and hybrid views
    if (mapType === 'satellite' || mapType === 'hybrid') {
        return '#ffffff';
    }
    // Black text for roadmap and terrain views
    return '#333333';
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
        Object.values(markers).forEach(marker => marker.setMap(null));
        markers = {};
    }
    
    // Add vehicle markers
    Object.values(vehicleData).forEach(vehicle => {
        if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
            const position = { lat: vehicle.location.lat, lng: vehicle.location.lng };
            
            // Check if marker already exists
            if (markers[vehicle.id]) {
                // Update existing marker position smoothly
                markers[vehicle.id].setPosition(position);
                markers[vehicle.id].setIcon({
                    url: '/img/gpsmarker.png',
                    scaledSize: new google.maps.Size(48, 48),
                    labelOrigin: new google.maps.Point(24, 60)
                });
                markers[vehicle.id].setLabel({
                    text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                    color: getLabelColor(),
                    fontSize: '11px',
                    fontWeight: 'bold',
                    className: 'vehicle-marker-label'
                });
                return; // Skip creating new marker
            }
            
            // Create marker with label below (only for new markers)
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `${vehicle.modelName} - ${vehicle.plateNumber}`,
                label: {
                    text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                    color: getLabelColor(),
                    fontSize: '11px',
                    fontWeight: 'bold',
                    className: 'vehicle-marker-label'
                },
                icon: {
                    url: '/img/gpsmarker.png',
                    scaledSize: new google.maps.Size(48, 48),
                    labelOrigin: new google.maps.Point(24, 60) // Position label below marker
                },
                animation: useDropAnimation ? google.maps.Animation.DROP : null
            });
            
            // Create info window with improved layout
            const infoWindowId = `infoWindow_${vehicle.id}`;
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div id="${infoWindowId}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 280px; max-width: 320px; border: none; box-shadow: none;">
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
                            ${vehicle.location.speed ? `
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                                <span style="color: #111827; font-size: 14px;">${vehicle.location.speed} km/h</span>
                            </div>
                            ` : ''}
                            ${vehicle.location.battery ? `
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                                <span style="color: #111827; font-size: 14px;">${vehicle.location.battery}%</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; align-items: center; padding: 10px 0;">
                                <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Last Update:</span>
                                <span style="color: #111827; font-size: 12px;">${formatDateFullPH(vehicle.location.lastUpdate)}</span>
                            </div>
                        </div>
                        <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                            <button onclick="showVehicleInfo(${vehicle.id})" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
                        </div>
                    </div>
                `
            });
            
            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
            
            markers[vehicle.id] = marker;
        }
    });
    
    // Add GPS device markers (unassigned devices)
    Object.values(gpsDevicesData).forEach(device => {
        if (!device.isAssigned && device.location && device.location.lat && device.location.lng) {
            const position = { lat: device.location.lat, lng: device.location.lng };
            const markerKey = `gps_${device.deviceId}`;
            
            // Check if marker already exists
            if (markers[markerKey]) {
                // Update existing marker position smoothly
                markers[markerKey].setPosition(position);
                markers[markerKey].setIcon({
                    url: '/img/gpsmarker.png',
                    scaledSize: new google.maps.Size(40, 40),
                    labelOrigin: new google.maps.Point(20, 55)
                });
                markers[markerKey].setLabel({
                    text: device.deviceId.substring(device.deviceId.length - 4) || 'GPS',
                    color: getLabelColor(),
                    fontSize: '10px',
                    fontWeight: 'bold',
                    className: 'gps-marker-label'
                });
                return; // Skip creating new marker
            }
            
            // Create marker for unassigned GPS device with label below (only for new markers)
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `GPS Device ${device.deviceId} (Unassigned)`,
                label: {
                    text: device.deviceId.substring(device.deviceId.length - 4) || 'GPS',
                    color: getLabelColor(),
                    fontSize: '10px',
                    fontWeight: 'bold',
                    className: 'gps-marker-label'
                },
                icon: {
                    url: '/img/gpsmarker.png',
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
                                <span style="color: #111827; font-size: 12px;">${formatDateFullPH(device.location.timestamp)}</span>
                            </div>
                        </div>
                        <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                            <button onclick="showGpsDeviceInfo('${device.deviceId}')" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
                        </div>
                    </div>
                `
            });
            
            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
            
            markers[`gps_${device.deviceId}`] = marker;
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
                    <p><strong>Last Update:</strong> ${formatDateFullPH(device.location.timestamp)}</p>
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

// Initialize Socket.IO connection for GPS tracking
function initGpsTrackingSocket() {
    if (typeof io === 'undefined') {
        console.warn('Socket.IO not available');
        return;
    }
    
    gpsTrackingSocket = io({
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000
    });
    
    gpsTrackingSocket.on('connect', () => {
        console.log('📍 GPS Tracking connected to Socket.IO server');
    });
    
    gpsTrackingSocket.on('disconnect', () => {
        console.log('📍 GPS Tracking disconnected from Socket.IO server');
    });
    
    gpsTrackingSocket.on('connect_error', (error) => {
        console.error('❌ GPS Tracking Socket.IO connection error:', error);
    });
    
    // Listen for real-time GPS location updates
    gpsTrackingSocket.on('driver-location-updated', async (data) => {
        console.log('📍 Received GPS location update:', data);
        
        if (data && data.deviceId && data.location) {
            await updateVehicleLocationFromSocket(data.deviceId, data.location);
        }
    });
}

// Update vehicle location from Socket.IO event
async function updateVehicleLocationFromSocket(deviceId, locationData) {
    try {
        // Find vehicle with this GPS device ID
        let vehicleId = null;
        for (const [id, vehicle] of Object.entries(vehicleData)) {
            if (vehicle.gpsDeviceId === deviceId) {
                vehicleId = id;
                break;
            }
        }
        
        // Calculate minutes since update
        const now = new Date();
        const updateTime = new Date(locationData.timestamp);
        const minutesSinceUpdate = Math.floor((now - updateTime) / (1000 * 60));
        const isOnline = minutesSinceUpdate < 10;
        
        if (vehicleId && vehicleData[vehicleId]) {
            // Update vehicle location
            vehicleData[vehicleId].location = {
                lat: locationData.lat,
                lng: locationData.lng,
                speed: locationData.speed || null,
                heading: locationData.heading || null,
                battery: locationData.battery || null,
                lastUpdate: locationData.timestamp,
                minutesSinceUpdate: minutesSinceUpdate
            };
            vehicleData[vehicleId].isOnline = isOnline;
            
            // Update marker on map
            updateMarkerForVehicle(vehicleId, vehicleData[vehicleId]);
            
            // Update vehicle list
            updateVehicleList();
        } else {
            // Check if it's an unassigned GPS device
            if (gpsDevicesData[deviceId]) {
                gpsDevicesData[deviceId].location = {
                    lat: locationData.lat,
                    lng: locationData.lng,
                    speed: locationData.speed || null,
                    heading: locationData.heading || null,
                    battery: locationData.battery || null,
                    timestamp: locationData.timestamp
                };
                gpsDevicesData[deviceId].isOnline = isOnline;
                
                // Update marker for unassigned device
                updateMarkerForGpsDevice(deviceId, gpsDevicesData[deviceId]);
                
                // Update vehicle list
                updateVehicleList();
            } else {
                // Device not found in our data, reload all vehicles to get updated data
                console.log(`📍 Device ${deviceId} not found in current data, reloading vehicles...`);
                await loadVehicles();
            }
        }
    } catch (error) {
        console.error('Error updating vehicle location from socket:', error);
    }
}

// Update marker for a specific vehicle
function updateMarkerForVehicle(vehicleId, vehicle) {
    if (!map || !vehicle.location) return;
    
    const position = { lat: vehicle.location.lat, lng: vehicle.location.lng };
    
    if (markers[vehicleId]) {
        // Update existing marker position
        markers[vehicleId].setPosition(position);
        markers[vehicleId].setIcon({
            url: '/img/gpsmarker.png',
            scaledSize: new google.maps.Size(48, 48),
            labelOrigin: new google.maps.Point(24, 60) // Position label below marker
        });
        // Update label text
        markers[vehicleId].setLabel({
            text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
            color: getLabelColor(),
            fontSize: '11px',
            fontWeight: 'bold',
            className: 'vehicle-marker-label'
        });
    } else {
        // Create new marker with label below
        const marker = new google.maps.Marker({
            position: position,
            map: map,
            title: `${vehicle.modelName} - ${vehicle.plateNumber}`,
            label: {
                text: vehicle.plateNumber || vehicle.modelName.substring(0, 8),
                color: getLabelColor(),
                fontSize: '11px',
                fontWeight: 'bold',
                className: 'vehicle-marker-label'
            },
            icon: {
                url: '/img/gpsmarker.png',
                scaledSize: new google.maps.Size(48, 48),
                labelOrigin: new google.maps.Point(24, 60) // Position label below marker
            },
            animation: google.maps.Animation.DROP
        });
        
        // Create info window
        const infoWindowId = `infoWindow_${vehicleId}`;
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div id="${infoWindowId}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 280px; max-width: 320px; border: none; box-shadow: none;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 14px 16px; margin: -8px -8px 0 -8px; border-radius: 8px 8px 0 0;">
                        <h4 style="margin: 0; color: #fff; font-size: 17px; font-weight: 600; letter-spacing: 0.3px;">${vehicle.modelName}</h4>
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
                        ${vehicle.location.speed ? `
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                            <span style="color: #111827; font-size: 14px;">${vehicle.location.speed} km/h</span>
                        </div>
                        ` : ''}
                        ${vehicle.location.battery ? `
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                            <span style="color: #111827; font-size: 14px;">${vehicle.location.battery}%</span>
                        </div>
                        ` : ''}
                        <div style="display: flex; align-items: center; padding: 10px 0;">
                            <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Last Update:</span>
                            <span style="color: #111827; font-size: 12px;">${formatDateFullPH(vehicle.location.lastUpdate)}</span>
                        </div>
                    </div>
                    <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                        <button onclick="showVehicleInfo(${vehicleId})" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
                    </div>
                </div>
            `
        });
        
        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
        
        markers[vehicleId] = marker;
    }
}

// Update marker for an unassigned GPS device
function updateMarkerForGpsDevice(deviceId, device) {
    if (!map || !device.location) return;
    
    const position = { lat: device.location.lat, lng: device.location.lng };
    const markerKey = `gps_${deviceId}`;
    
    if (markers[markerKey]) {
        // Update existing marker position
        markers[markerKey].setPosition(position);
        markers[markerKey].setIcon({
            url: '/img/gpsmarker.png',
            scaledSize: new google.maps.Size(40, 40),
            labelOrigin: new google.maps.Point(20, 55) // Position label below marker
        });
        // Update label text
        markers[markerKey].setLabel({
            text: deviceId.substring(deviceId.length - 4) || 'GPS',
            color: getLabelColor(),
            fontSize: '10px',
            fontWeight: 'bold',
            className: 'gps-marker-label'
        });
    } else if (!device.isAssigned) {
        // Create new marker for unassigned device with label below
        const marker = new google.maps.Marker({
            position: position,
            map: map,
            title: `GPS Device ${deviceId} (Unassigned)`,
            label: {
                text: deviceId.substring(deviceId.length - 4) || 'GPS',
                color: getLabelColor(),
                fontSize: '10px',
                fontWeight: 'bold',
                className: 'gps-marker-label'
            },
            icon: {
                url: '/img/gpsmarker.png',
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
                            <span style="color: #111827; font-size: 12px;">${formatDateFullPH(device.location.timestamp)}</span>
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
    }
}

// Initialize Socket.IO when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize Socket.IO after a short delay to ensure io is available
        setTimeout(() => {
            initGpsTrackingSocket();
        }, 500);
    });
}

// Note: initMap() is called from the EJS template after script loads

