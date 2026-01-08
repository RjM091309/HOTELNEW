// ========================================
// INFOWINDOW - Vehicle Monitoring
// ========================================

import { vehicleData, gpsDevicesData, currentInfoWindow, infoWindows } from './state.js';
import { getStatusInfo } from './status.js';
import { formatDateFullPH, getAddressFromCoordinates } from './utils.js';
import {
    BATTERY_LOW_THRESHOLD,
    BATTERY_MID_THRESHOLD,
    BATTERY_HIGH_THRESHOLD,
    INFO_WINDOW_ADDRESS_DELAY_MS
} from './constants.js';

// Lock to prevent concurrent InfoWindow updates
let isUpdatingInfoWindow = false;

// Generate satellite icon HTML (Sinotrack style)
function generateSatelliteIcon(satelliteCount) {
    const safeCount = (satelliteCount === null || satelliteCount === undefined) ? 0 : satelliteCount;
    return `
        <div class="GPS" style="display: inline-flex; align-items: center; gap: 4px;">
            <img src="/img/Satellite.png" alt="Satellite" style="width: 16px; height: 16px; object-fit: contain;">
            <span style="color: #999999; font-size: 13px; font-weight: 600;">${safeCount}</span>
        </div>
    `;
}

// Generate GSM signal icon HTML (Sinotrack style)
function generateGsmSignalIcon(gsmSignal) {
    const safeSignal = (gsmSignal === null || gsmSignal === undefined || gsmSignal === '') ? 0 : gsmSignal;
    return `
        <div class="GSM" style="display: inline-flex; align-items: center; gap: 4px;">
            <img src="/img/GSM.png" alt="GSM Signal" style="width: 16px; height: 16px; object-fit: contain;">
            <span style="color: #999999; font-size: 13px; font-weight: 600;">${safeSignal}</span>
        </div>
    `;
}

// Generate battery icon HTML (Sinotrack style) with optional charging animation
function generateBatteryIcon(batteryPercent, isCharging = false) {
    if (batteryPercent === null || batteryPercent === undefined) return '';
    
    // Ensure isCharging is a boolean (handle null and undefined)
    const charging = (isCharging === null || isCharging === undefined) ? false : !!isCharging;
    
    // Determine power class based on battery level
    let powerClass = 'HightPower';
    if (batteryPercent < BATTERY_LOW_THRESHOLD) {
        powerClass = 'PowerOff';
    } else if (batteryPercent < BATTERY_MID_THRESHOLD) {
        powerClass = 'LowPower';
    } else if (batteryPercent < BATTERY_HIGH_THRESHOLD) {
        powerClass = 'MidPower';
    }
    
    // Calculate fill width (percentage of battery)
    const fillWidth = Math.min(100, Math.max(0, batteryPercent));
    
    return `
        <div class="Power ${powerClass} ${charging ? 'is-charging' : ''}" style="position: relative; height: 18px;" title="${charging ? `Charging - ${batteryPercent}%` : `${batteryPercent}%`}">
            <div class="ChargeAnim"></div>
            <div class="Rate" style="width: ${fillWidth}%; height: 100%;"></div>
            <div class="Label">${batteryPercent}%</div>
            <div class="Tip"></div>
        </div>
    `;
}

// Generate InfoWindow content for a vehicle
export function generateVehicleInfoWindowContent(vehicle, address = null) {
    const statusInfo = getStatusInfo(vehicle.isOnline, vehicle.isMoving || false);
    const timeValue = vehicle.location && vehicle.location.lastUpdate 
        ? formatDateFullPH(vehicle.location.lastUpdate) 
        : 'N/A';
    
    return `
        <div id="infoWindow_${vehicle.id}" class="MapAppPurePosTip">
            <div class="Arrow"></div>
            <div class="Content">
                <div class="TopSignalPower">
                    <span class="TimeValue">${vehicle.modelName}</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${vehicle.location ? generateSatelliteIcon(vehicle.location.satelliteCount) : ''}
                        ${vehicle.location ? generateGsmSignalIcon(vehicle.location.gsmSignal) : ''}
                        ${vehicle.location && (vehicle.location.battery !== null && vehicle.location.battery !== undefined) ? generateBatteryIcon(vehicle.location.battery, vehicle.location.isCharging) : ''}
                    </div>
                </div>
                <table>
                    <tr>
                        <th>Plate:</th>
                        <td>${vehicle.plateNumber}</td>
                    </tr>
                    <tr>
                        <th>Type:</th>
                        <td>${vehicle.vehicleType}</td>
                    </tr>
                    <tr>
                        <th>GPS Device:</th>
                        <td style="font-family: 'Courier New', monospace;">${vehicle.gpsDeviceId || 'Not assigned'}</td>
                    </tr>
                    <tr>
                        <th>Status:</th>
                        <td><span style="color: ${statusInfo.dotColor}; font-weight: 600;">● ${statusInfo.text}</span></td>
                    </tr>
                    ${vehicle.location ? `
                    <tr>
                        <th>Speed:</th>
                        <td class="SportValue">${(vehicle.isMoving && vehicle.location.speed) ? vehicle.location.speed : '0'} km/h</td>
                    </tr>
                    ` : ''}
                    ${vehicle.location && address ? `
                    <tr>
                        <th>Location:</th>
                        <td class="AddressValue" id="address_${vehicle.id}">${address}</td>
                    </tr>
                    ` : vehicle.location ? `
                    <tr>
                        <th>Location:</th>
                        <td class="AddressValue" id="address_${vehicle.id}">Loading address...</td>
                    </tr>
                    ` : ''}
                </table>
            </div>
            <div class="Operation">
                <div class="Button" onclick="showVehicleInfo(${vehicle.id})">View Details</div>
                <div class="Button">Replay</div>
            </div>
        </div>
    `;
}

// Generate InfoWindow content for GPS device
export function generateGpsDeviceInfoWindowContent(device, address = null) {
    const statusInfo = getStatusInfo(device.isOnline, device.isMoving || false);
    const timeValue = device.location && (device.location.lastUpdate || device.location.createdAt)
        ? formatDateFullPH(device.location.lastUpdate || device.location.createdAt)
        : 'N/A';
    
    return `
        <div id="infoWindow_gps_${device.deviceId}" class="MapAppPurePosTip">
            <div class="Arrow"></div>
            <div class="Content">
                <div class="TopSignalPower">
                    <span class="TimeValue">📍 GPS Device</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${device.location ? generateSatelliteIcon(device.location.satelliteCount) : ''}
                        ${device.location ? generateGsmSignalIcon(device.location.gsmSignal) : ''}
                        ${device.location && (device.location.battery !== null && device.location.battery !== undefined) ? generateBatteryIcon(device.location.battery, device.location.isCharging) : ''}
                    </div>
                </div>
                <table>
                    <tr>
                        <th>Device ID:</th>
                        <td style="font-family: 'Courier New', monospace; font-weight: 600;">${device.deviceId}</td>
                    </tr>
                    <tr>
                        <th>Status:</th>
                        <td><span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Not Assigned</span></td>
                    </tr>
                    <tr>
                        <th>GPS Status:</th>
                        <td><span style="color: ${statusInfo.dotColor}; font-weight: 600;">● ${statusInfo.text}</span></td>
                    </tr>
                    ${device.location ? `
                    <tr>
                        <th>Speed:</th>
                        <td class="SportValue">${(device.isMoving && device.location.speed) ? device.location.speed : '0'} km/h</td>
                    </tr>
                    ` : ''}
                    ${device.location && address ? `
                    <tr>
                        <th>Location:</th>
                        <td class="AddressValue" id="address_gps_${device.deviceId}">${address}</td>
                    </tr>
                    ` : device.location ? `
                    <tr>
                        <th>Location:</th>
                        <td class="AddressValue" id="address_gps_${device.deviceId}">Loading address...</td>
                    </tr>
                    ` : ''}
                </table>
            </div>
            <div class="Operation">
                <div class="Button" onclick="showGpsDeviceInfo('${device.deviceId}')">View Details</div>
                <div class="Button">Replay</div>
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
                    ${vehicle.location.battery ? `<p><strong>Battery:</strong> ${vehicle.location.battery}%${vehicle.location.isCharging ? ' (Charging)' : ''}</p>` : ''}
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
                    ${device.location.battery ? `<p><strong>Battery:</strong> ${device.location.battery}%${device.location.isCharging ? ' (Charging)' : ''}</p>` : ''}
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
    // Prevent concurrent updates (race condition protection)
    if (isUpdatingInfoWindow) {
        return; // Skip if update is already in progress
    }
    
    try {
        isUpdatingInfoWindow = true;
        
        if (!currentInfoWindow) {
            isUpdatingInfoWindow = false;
            return; // No InfoWindow is open
        }
        
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
                    vehicleId = key; // Use string ID directly (no parseInt)
                }
                break;
            }
        }
        
        if (!markerKey) return; // InfoWindow not found in our records
        
        // Update vehicle InfoWindow
        if (vehicleId !== null) {
            const vehicle = vehicleData[vehicleId]; // vehicleId is already a string
            if (!vehicle) return; // Vehicle not found
            
            // Get current address from DOM if available
            const addressElement = document.getElementById(`address_${vehicleId}`);
            let currentAddress = (addressElement && addressElement.textContent) ? addressElement.textContent : null;
            
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
            }, INFO_WINDOW_ADDRESS_DELAY_MS);
        }
        }
        // Update GPS device InfoWindow
        else if (deviceId !== null) {
            const device = gpsDevicesData[deviceId];
            if (!device) return; // Device not found
            
            // Get current address from DOM if available
            const addressElement = document.getElementById(`address_gps_${deviceId}`);
            let currentAddress = (addressElement && addressElement.textContent) ? addressElement.textContent : null;
            
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
            }, INFO_WINDOW_ADDRESS_DELAY_MS);
        }
        }
    } catch (error) {
        // Silently handle errors to prevent breaking the update flow
        logWarn('Error updating InfoWindow', error, 'InfoWindow');
    } finally {
        // Always release lock, even on error
        isUpdatingInfoWindow = false;
    }
}

// Export functions globally for backward compatibility
window.showVehicleInfo = showVehicleInfo;
window.showGpsDeviceInfo = showGpsDeviceInfo;
