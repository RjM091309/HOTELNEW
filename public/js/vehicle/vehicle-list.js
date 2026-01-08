// ========================================
// VEHICLE LIST - Vehicle Monitoring
// ========================================

import { map, markers, vehicleData, gpsDevicesData } from './state.js';
import { formatDatePH, formatMinutesAgo } from './utils.js';
import { getStatusInfo } from './status.js';
import { showVehicleInfo, showGpsDeviceInfo } from './infowindow.js';
import {
    MAX_MAP_ZOOM,
    BOUNCE_ANIMATION_DURATION_MS
} from './constants.js';

// Update vehicle list
export function updateVehicleList() {
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
        const statusInfo = getStatusInfo(vehicle.isOnline, vehicle.isMoving || false);
        const statusClass = hasLocation ? statusInfo.badgeClass : 'secondary';
        const statusText = hasLocation ? statusInfo.text : 'No GPS';
        const statusIcon = vehicle.isOnline ? 'fa-circle' : (hasLocation ? 'fa-circle-o' : 'fa-times-circle');
        const statusColor = hasLocation ? statusInfo.color : '#6c757d';
        
        html += `
            <div class="vehicle-card vehicle-item" data-vehicle-id="${String(vehicle.id)}" data-type="vehicle">
                <div class="vehicle-card-header">
                    <div class="vehicle-title-section">
                        <h6 class="vehicle-name">${vehicle.modelName}</h6>
                        <span class="vehicle-plate">${vehicle.plateNumber}</span>
                    </div>
                    <div class="vehicle-status-badge">
                        <span class="badge bg-${statusClass} ${vehicle.isOnline ? 'status-online' : ''}" style="background-color: ${statusColor} !important; color: white;">${statusText}</span>
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
                                ${vehicle.location.minutesSinceUpdate !== null ? `<span class="location-ago">${formatMinutesAgo(vehicle.location.minutesSinceUpdate)}</span>` : ''}
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
                                    ${device.location.minutesSinceUpdate !== null && device.location.minutesSinceUpdate !== undefined ? `<span class="location-ago">${formatMinutesAgo(device.location.minutesSinceUpdate)}</span>` : ''}
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
    
    // Use event delegation to prevent memory leaks from duplicate listeners
    // Remove old listeners if they exist (only one listener on container)
    const container = vehicleList.querySelector('.vehicle-list-container');
    if (container) {
        // Remove existing listeners by cloning (removes all event listeners)
        const newContainer = container.cloneNode(true);
        container.replaceWith(newContainer);
        
        // Add single event listener on container (event delegation)
        newContainer.addEventListener('click', function(event) {
            // Find the closest vehicle-item or gps-device-item
            const vehicleItem = event.target.closest('.vehicle-item');
            const gpsDeviceItem = event.target.closest('.gps-device-item');
            
            if (vehicleItem) {
                const vehicleId = vehicleItem.dataset.vehicleId;
                if (!vehicleId) return;
                
                showVehicleInfo(vehicleId);
                if (map && markers[vehicleId]) {
                    const marker = markers[vehicleId];
                    const position = marker.getPosition();
                    if (position) {
                        map.setCenter(position);
                        map.setZoom(MAX_MAP_ZOOM);
                        marker.setAnimation(google.maps.Animation.BOUNCE);
                        setTimeout(() => {
                            if (markers[vehicleId]) {
                                markers[vehicleId].setAnimation(null);
                            }
                        }, BOUNCE_ANIMATION_DURATION_MS);
                    }
                }
            } else if (gpsDeviceItem) {
                const deviceId = gpsDeviceItem.dataset.deviceId;
                if (!deviceId) return;
                
                showGpsDeviceInfo(deviceId);
                const markerKey = `gps_${deviceId}`;
                if (map && markers[markerKey]) {
                    const marker = markers[markerKey];
                    const position = marker.getPosition();
                    if (position) {
                        map.setCenter(position);
                        map.setZoom(MAX_MAP_ZOOM);
                        marker.setAnimation(google.maps.Animation.BOUNCE);
                        setTimeout(() => {
                            if (markers[markerKey]) {
                                markers[markerKey].setAnimation(null);
                            }
                        }, BOUNCE_ANIMATION_DURATION_MS);
                    }
                }
            }
        });
    }
}

