// ========================================
// VEHICLE MONITORING - GPS TRACKING
// ========================================

let map;
let markers = {};
let vehicleData = {};
let gpsDevicesData = {};
let autoRefreshInterval = null;
let isAutoRefresh = false;

// Initialize Google Maps
async function initMap() {
    try {
        // Get Google Maps API key
        const apiKeyResponse = await fetch('/api/maps/api-key');
        const apiKeyData = await apiKeyResponse.json();
        
        if (!apiKeyData.success || !apiKeyData.apiKey) {
            console.error('Google Maps API key not found');
            document.getElementById('map').innerHTML = '<div class="alert alert-danger">Google Maps API key is not configured. Please set VITE_GOOGLE_MAPS_API_KEY in environment variables.</div>';
            return;
        }
        
        // Load Google Maps script
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKeyData.apiKey}&libraries=places&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            // Wait a bit to ensure google.maps is fully loaded
            setTimeout(() => {
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
                    // Clear loading message
                    mapDiv.innerHTML = '';
                    mapDiv.style.backgroundColor = '';
                    mapDiv.style.display = '';
                    mapDiv.style.alignItems = '';
                    mapDiv.style.justifyContent = '';
                    
                    // Initialize map after script loads
                    map = new google.maps.Map(mapDiv, {
                        center: { lat: 14.5995, lng: 120.9842 }, // Default to Manila
                        zoom: 12,
                        mapTypeId: 'roadmap'
                    });
                    
                    console.log('Map initialized successfully');
                    
                    // Load vehicles
                    loadVehicles();
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

// Load vehicles with GPS location
async function loadVehicles() {
    try {
        // Load vehicles with GPS
        const vehiclesResponse = await fetch('/vehicle/api/monitoring/vehicles');
        const vehiclesData = await vehiclesResponse.json();
        
        // Load all GPS devices (including unassigned)
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
    const vehicles = Object.values(vehicleData);
    const gpsDevices = Object.values(gpsDevicesData);
    
    if (vehicles.length === 0 && gpsDevices.length === 0) {
        vehicleList.innerHTML = '<p class="text-center text-muted">No vehicles or GPS devices found</p>';
        return;
    }
    
    // Use table format like vehicle management page for dark mode compatibility
    let html = '<table class="table table-hover table-bordered" style="margin-bottom: 0;">';
    html += '<thead><tr><th>Vehicle / GPS Device</th><th>Status</th></tr></thead><tbody>';
    
    // Show vehicles with GPS
    vehicles.forEach(vehicle => {
        const hasLocation = vehicle.location !== null;
        const statusClass = vehicle.isOnline ? 'success' : (hasLocation ? 'warning' : 'secondary');
        const statusText = vehicle.isOnline ? 'Online' : (hasLocation ? 'Offline' : 'No GPS');
        
        html += `
            <tr class="vehicle-item" data-vehicle-id="${vehicle.id}" data-type="vehicle" style="cursor: pointer;">
                <td>
                    <strong>${vehicle.modelName}</strong><br>
                    <small class="text-muted">Plate: ${vehicle.plateNumber} | Type: ${vehicle.vehicleType}</small><br>
                    <small class="text-info">GPS: ${vehicle.gpsDeviceId || 'Not assigned'}</small><br>
                    ${hasLocation ? `
                        <small class="text-muted">
                            <i class="fa fa-map-marker"></i> 
                            ${vehicle.location.lastUpdate ? new Date(vehicle.location.lastUpdate).toLocaleString() : 'N/A'}
                            ${vehicle.location.minutesSinceUpdate !== null ? `(${vehicle.location.minutesSinceUpdate} min ago)` : ''}
                        </small>
                    ` : vehicle.hasGps ? '<small class="text-warning">Waiting for GPS data...</small>' : '<small class="text-muted">No GPS device assigned</small>'}
                </td>
                <td class="text-center">
                    <span class="badge bg-${statusClass}">${statusText}</span>
                </td>
            </tr>
        `;
    });
    
    // Show unassigned GPS devices
    gpsDevices.forEach(device => {
        if (!device.isAssigned && device.location) {
            const statusClass = device.isOnline ? 'success' : 'warning';
            const statusText = device.isOnline ? 'Online' : 'Offline';
            
            html += `
                <tr class="gps-device-item" data-device-id="${device.deviceId}" data-type="gps" style="cursor: pointer;">
                    <td>
                        <strong><i class="fa fa-map-marker"></i> GPS Device</strong><br>
                        <small class="text-muted">Device ID: ${device.deviceId}</small><br>
                        <small class="text-warning">Not assigned to vehicle</small><br>
                        ${device.location ? `
                            <small class="text-muted">
                                <i class="fa fa-map-marker"></i> 
                                ${device.location.timestamp ? new Date(device.location.timestamp).toLocaleString() : 'N/A'}
                            </small>
                        ` : '<small class="text-muted">No location data</small>'}
                    </td>
                    <td class="text-center">
                        <span class="badge bg-${statusClass}">${statusText}</span>
                    </td>
                </tr>
            `;
        }
    });
    
    html += '</tbody></table>';
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

// Update map markers
function updateMapMarkers() {
    if (!map) return;
    
    // Remove old markers
    Object.values(markers).forEach(marker => marker.setMap(null));
    markers = {};
    
    // Add vehicle markers
    Object.values(vehicleData).forEach(vehicle => {
        if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
            const position = { lat: vehicle.location.lat, lng: vehicle.location.lng };
            
            // Create marker
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `${vehicle.modelName} - ${vehicle.plateNumber}`,
                icon: {
                    url: vehicle.isOnline ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
                    scaledSize: new google.maps.Size(32, 32)
                },
                animation: google.maps.Animation.DROP
            });
            
            // Create info window
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="padding: 10px; min-width: 200px;">
                        <h6 style="margin-bottom: 10px;">${vehicle.modelName}</h6>
                        <p style="margin-bottom: 5px;"><strong>Plate:</strong> ${vehicle.plateNumber}<br>
                        <strong>Type:</strong> ${vehicle.vehicleType}<br>
                        <strong>GPS Device:</strong> ${vehicle.gpsDeviceId || 'Not assigned'}<br>
                        <strong>Status:</strong> <span style="color: ${vehicle.isOnline ? '#28a745' : '#ffc107'};">${vehicle.isOnline ? 'Online' : 'Offline'}</span><br>
                        ${vehicle.location.speed ? `<strong>Speed:</strong> ${vehicle.location.speed} km/h<br>` : ''}
                        ${vehicle.location.battery ? `<strong>Battery:</strong> ${vehicle.location.battery}%<br>` : ''}
                        <strong>Last Update:</strong> ${vehicle.location.lastUpdate ? new Date(vehicle.location.lastUpdate).toLocaleString() : 'N/A'}
                        </p>
                        <button class="btn btn-sm btn-primary" onclick="showVehicleInfo(${vehicle.id})" style="margin-top: 5px;">View Details</button>
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
            
            // Create marker for unassigned GPS device
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `GPS Device ${device.deviceId} (Unassigned)`,
                icon: {
                    url: device.isOnline ? 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' : 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png',
                    scaledSize: new google.maps.Size(28, 28)
                },
                animation: google.maps.Animation.DROP
            });
            
            // Create info window
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="padding: 10px; min-width: 200px;">
                        <h6 style="margin-bottom: 10px;"><i class="fa fa-map-marker"></i> GPS Device</h6>
                        <p style="margin-bottom: 5px;"><strong>Device ID:</strong> ${device.deviceId}<br>
                        <strong>Status:</strong> <span class="badge bg-warning">Not Assigned</span><br>
                        <strong>GPS Status:</strong> <span style="color: ${device.isOnline ? '#28a745' : '#ffc107'};">${device.isOnline ? 'Online' : 'Offline'}</span><br>
                        ${device.location.speed ? `<strong>Speed:</strong> ${device.location.speed} km/h<br>` : ''}
                        ${device.location.battery ? `<strong>Battery:</strong> ${device.location.battery}%<br>` : ''}
                        <strong>Last Update:</strong> ${device.location.timestamp ? new Date(device.location.timestamp).toLocaleString() : 'N/A'}
                        </p>
                        <button class="btn btn-sm btn-primary" onclick="showGpsDeviceInfo('${device.deviceId}')" style="margin-top: 5px;">View Details</button>
                    </div>
                `
            });
            
            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
            
            markers[`gps_${device.deviceId}`] = marker;
        }
    });
    
    // Fit map to show all markers
    if (Object.keys(markers).length > 0) {
        const bounds = new google.maps.LatLngBounds();
        Object.values(markers).forEach(marker => {
            bounds.extend(marker.getPosition());
        });
        map.fitBounds(bounds);
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
                    <p><strong>Last Update:</strong> ${vehicle.location.lastUpdate ? new Date(vehicle.location.lastUpdate).toLocaleString() : 'N/A'}</p>
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
                    <p><strong>Last Update:</strong> ${device.location.timestamp ? new Date(device.location.timestamp).toLocaleString() : 'N/A'}</p>
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

// Refresh button
document.getElementById('refreshBtn').addEventListener('click', () => {
    loadVehicles();
});

// Auto refresh toggle
document.getElementById('autoRefreshBtn').addEventListener('click', function() {
    if (isAutoRefresh) {
        // Stop auto refresh
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        isAutoRefresh = false;
        this.innerHTML = '<i class="fa fa-play"></i> Auto Refresh';
        this.classList.remove('btn-danger');
        this.classList.add('btn-success');
    } else {
        // Start auto refresh
        autoRefreshInterval = setInterval(() => {
            loadVehicles();
        }, 30000); // Refresh every 30 seconds
        isAutoRefresh = true;
        this.innerHTML = '<i class="fa fa-stop"></i> Stop Auto Refresh';
        this.classList.remove('btn-success');
        this.classList.add('btn-danger');
    }
});

// Note: initMap() is called from the EJS template after script loads

