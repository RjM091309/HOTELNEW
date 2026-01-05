// ========================================
// INFOWINDOW - Vehicle Monitoring
// ========================================

import { vehicleData, gpsDevicesData, currentInfoWindow, infoWindows } from './state.js';
import { getStatusInfo } from './status.js';
import { formatDateFullPH, getAddressFromCoordinates } from './utils.js';

// Generate InfoWindow content for a vehicle
export function generateVehicleInfoWindowContent(vehicle, address = null) {
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
                    ${(() => {
                        const statusInfo = getStatusInfo(vehicle.isOnline, vehicle.isMoving || false);
                        return `<span style="color: ${statusInfo.dotColor}; font-weight: 600; font-size: 14px;">● ${statusInfo.text}</span>`;
                    })()}
                </div>
                ${vehicle.location ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                    <span style="color: #111827; font-size: 14px;">${(vehicle.isMoving && vehicle.location.speed) ? vehicle.location.speed : '0'} km/h</span>
                </div>
                ` : ''}
                ${vehicle.location && (vehicle.location.battery !== null && vehicle.location.battery !== undefined) ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                    <span style="color: #111827; font-size: 14px;">${vehicle.location.battery}%</span>
                </div>
                ` : ''}
                ${vehicle.location && (vehicle.location.satelliteCount !== null && vehicle.location.satelliteCount !== undefined && vehicle.location.satelliteCount !== 0) ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Satellites:</span>
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">${vehicle.location.satelliteCount}</span>
                    <i class="fa fa-satellite" style="color: #3b82f6; margin-left: 6px; font-size: 14px;"></i>
                </div>
                ` : ''}
                ${vehicle.location && (vehicle.location.gsmSignal !== null && vehicle.location.gsmSignal !== undefined && vehicle.location.gsmSignal !== '') ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">GSM Signal:</span>
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">${vehicle.location.gsmSignal}</span>
                    <i class="fa fa-signal" style="color: #3b82f6; margin-left: 6px; font-size: 14px;"></i>
                </div>
                ` : ''}
                ${vehicle.location ? `
                <div style="display: flex; align-items: flex-start; padding: 10px 0; border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 12px;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500; margin-top: 2px;">Location:</span>
                    <span id="address_${vehicle.id}" style="color: #111827; font-size: 13px; line-height: 1.4; flex: 1;">${address || 'Loading address...'}</span>
                </div>
                ` : ''}
            </div>
            <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                <button onclick="showVehicleInfo(${vehicle.id})" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
            </div>
        </div>
    `;
}

// Generate InfoWindow content for GPS device
export function generateGpsDeviceInfoWindowContent(device, address = null) {
    return `
        <div id="infoWindow_gps_${device.deviceId}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 280px; max-width: 320px; border: none; box-shadow: none;">
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
                    ${(() => {
                        const statusInfo = getStatusInfo(device.isOnline, device.isMoving || false);
                        return `<span style="color: ${statusInfo.dotColor}; font-weight: 600; font-size: 14px;">● ${statusInfo.text}</span>`;
                    })()}
                </div>
                ${device.location ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Speed:</span>
                    <span style="color: #111827; font-size: 14px;">${(device.isMoving && device.location.speed) ? device.location.speed : '0'} km/h</span>
                </div>
                ` : ''}
                ${device.location && device.location.battery ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Battery:</span>
                    <span style="color: #111827; font-size: 14px;">${device.location.battery}%</span>
                </div>
                ` : ''}
                ${device.location && device.location.satelliteCount !== null && device.location.satelliteCount !== undefined ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">Satellites:</span>
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">${device.location.satelliteCount}</span>
                    <i class="fa fa-satellite" style="color: #3b82f6; margin-left: 6px; font-size: 14px;"></i>
                </div>
                ` : ''}
                ${device.location && (device.location.gsmSignal !== null && device.location.gsmSignal !== undefined && device.location.gsmSignal !== '') ? `
                <div style="display: flex; align-items: center; padding: 10px 0;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500;">GSM Signal:</span>
                    <span style="color: #111827; font-size: 14px; font-weight: 600;">${device.location.gsmSignal}</span>
                    <i class="fa fa-signal" style="color: #3b82f6; margin-left: 6px; font-size: 14px;"></i>
                </div>
                ` : ''}
                ${device.location ? `
                <div style="display: flex; align-items: flex-start; padding: 10px 0; border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 12px;">
                    <span style="color: #6b7280; font-size: 12px; min-width: 100px; display: inline-block; font-weight: 500; margin-top: 2px;">Location:</span>
                    <span id="address_gps_${device.deviceId}" style="color: #111827; font-size: 13px; line-height: 1.4; flex: 1;">${address || 'Loading address...'}</span>
                </div>
                ` : ''}
            </div>
            <div style="padding: 12px 16px; background: #f9fafb; border-radius: 0 0 8px 8px; margin: 0 -8px -8px -8px;">
                <button onclick="showGpsDeviceInfo('${device.deviceId}')" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); transition: all 0.2s;">View Details</button>
            </div>
        </div>
    `;
}

// Show vehicle information modal
export function showVehicleInfo(vehicleId) {
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
                    <p><strong>Status:</strong> ${(() => {
                        const statusInfo = getStatusInfo(vehicle.isOnline, vehicle.isMoving || false);
                        return `<span class="badge bg-${statusInfo.badgeClass}">${statusInfo.text}</span>`;
                    })()}</p>
                    <p><strong>Coordinates:</strong> ${vehicle.location.lat.toFixed(6)}, ${vehicle.location.lng.toFixed(6)}</p>
                    ${vehicle.location.speed ? `<p><strong>Speed:</strong> ${vehicle.location.speed} km/h</p>` : ''}
                    ${vehicle.location.heading ? `<p><strong>Heading:</strong> ${vehicle.location.heading}°</p>` : ''}
                    ${vehicle.location.battery ? `<p><strong>Battery:</strong> ${vehicle.location.battery}%</p>` : ''}
                    ${vehicle.location.satelliteCount !== null && vehicle.location.satelliteCount !== undefined ? `<p><strong>Satellites:</strong> ${vehicle.location.satelliteCount} <i class="fa fa-satellite" style="color: #3b82f6;"></i></p>` : ''}
                    ${vehicle.location.gsmSignal !== null && vehicle.location.gsmSignal !== undefined ? `<p><strong>GSM Signal:</strong> ${vehicle.location.gsmSignal} <i class="fa fa-signal" style="color: #3b82f6;"></i></p>` : ''}
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

// Show GPS device information modal
export function showGpsDeviceInfo(deviceId) {
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
                    <p><strong>GPS Status:</strong> ${(() => {
                        const statusInfo = getStatusInfo(device.isOnline, device.isMoving || false);
                        return `<span class="badge bg-${statusInfo.badgeClass}">${statusInfo.text}</span>`;
                    })()}</p>
                    <p><strong>Coordinates:</strong> ${device.location.lat.toFixed(6)}, ${device.location.lng.toFixed(6)}</p>
                    ${device.location.speed ? `<p><strong>Speed:</strong> ${device.location.speed} km/h</p>` : ''}
                    ${device.location.heading ? `<p><strong>Heading:</strong> ${device.location.heading}°</p>` : ''}
                    ${device.location.battery ? `<p><strong>Battery:</strong> ${device.location.battery}%</p>` : ''}
                    ${device.location.satelliteCount !== null && device.location.satelliteCount !== undefined ? `<p><strong>Satellites:</strong> ${device.location.satelliteCount} <i class="fa fa-satellite" style="color: #3b82f6;"></i></p>` : ''}
                    ${device.location.gsmSignal !== null && device.location.gsmSignal !== undefined ? `<p><strong>GSM Signal:</strong> ${device.location.gsmSignal} <i class="fa fa-signal" style="color: #3b82f6;"></i></p>` : ''}
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

// Update open InfoWindow with latest data (real-time update)
export async function updateOpenInfoWindow() {
    try {
        if (!currentInfoWindow) return; // No InfoWindow is open
        
        // Find which vehicle or device this InfoWindow belongs to
        let vehicleId = null;
        let deviceId = null;
        let markerKey = null;
        
        // Check if it's a vehicle InfoWindow
        for (const [key, infoWindow] of Object.entries(infoWindows)) {
            if (infoWindow === currentInfoWindow) {
                markerKey = key;
                if (key.startsWith('gps_')) {
                    deviceId = key.replace('gps_', '');
                } else {
                    vehicleId = parseInt(key);
                }
                break;
            }
        }
        
        if (!markerKey) return; // InfoWindow not found in our records
        
        // Update vehicle InfoWindow
        if (vehicleId !== null) {
            const vehicle = vehicleData[vehicleId];
            if (!vehicle) return; // Vehicle not found
            
            // Get current address from DOM if available
            const addressElement = document.getElementById(`address_${vehicleId}`);
            let currentAddress = addressElement ? addressElement.textContent : null;
            
            // If address is "Loading address..." or empty, fetch it
            if (!currentAddress || currentAddress === 'Loading address...') {
                if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
                    currentAddress = await getAddressFromCoordinates(vehicle.location.lat, vehicle.location.lng);
                }
            }
            
            // Update InfoWindow content
            const newContent = generateVehicleInfoWindowContent(vehicle, currentAddress);
            currentInfoWindow.setContent(newContent);
            
            // Re-fetch address if location changed
            if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
                setTimeout(async () => {
                    const addressElement = document.getElementById(`address_${vehicleId}`);
                    if (addressElement && addressElement.textContent === 'Loading address...') {
                        const address = await getAddressFromCoordinates(vehicle.location.lat, vehicle.location.lng);
                        if (address) {
                            addressElement.textContent = address;
                        }
                    }
                }, 100);
            }
        }
        // Update GPS device InfoWindow
        else if (deviceId !== null) {
            const device = gpsDevicesData[deviceId];
            if (!device) return; // Device not found
            
            // Get current address from DOM if available
            const addressElement = document.getElementById(`address_gps_${deviceId}`);
            let currentAddress = addressElement ? addressElement.textContent : null;
            
            // If address is "Loading address..." or empty, fetch it
            if (!currentAddress || currentAddress === 'Loading address...') {
                if (device.location && device.location.lat && device.location.lng) {
                    currentAddress = await getAddressFromCoordinates(device.location.lat, device.location.lng);
                }
            }
            
            // Update InfoWindow content
            const newContent = generateGpsDeviceInfoWindowContent(device, currentAddress);
            currentInfoWindow.setContent(newContent);
            
            // Re-fetch address if location changed
            if (device.location && device.location.lat && device.location.lng) {
                setTimeout(async () => {
                    const addressElement = document.getElementById(`address_gps_${deviceId}`);
                    if (addressElement && addressElement.textContent === 'Loading address...') {
                        const address = await getAddressFromCoordinates(device.location.lat, device.location.lng);
                        if (address) {
                            addressElement.textContent = address;
                        }
                    }
                }, 100);
            }
        }
    } catch (error) {
        // Silently handle errors to prevent breaking the update flow
        console.warn('⚠️ Error updating InfoWindow:', error);
    }
}

// Export functions globally for backward compatibility
window.showVehicleInfo = showVehicleInfo;
window.showGpsDeviceInfo = showGpsDeviceInfo;
