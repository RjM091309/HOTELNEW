// ========================================
// MARKERS - Vehicle Monitoring
// ========================================

import { 
    map, 
    markers, 
    vehicleData, 
    gpsDevicesData, 
    isFirstMapLoad, 
    setIsFirstMapLoad,
    currentInfoWindow,
    setCurrentInfoWindow,
    infoWindows,
    markerAnimations,
    polylines,
    vehiclePaths,
    traceEnabled
} from './state.js';
import { calculateDistanceMeters, easeOutCubic, getAddressFromCoordinates, hexToRgb } from './utils.js';
import { getMarkerIconUrl, getStatusInfo } from './status.js';
import { generateVehicleInfoWindowContent, generateGpsDeviceInfoWindowContent } from './infowindow.js';

// Keep map centered on a target when trace is enabled
function followTraceTarget(markerKey, position, distanceThresholdMeters = 30) {
    if (!map || !position || position.lat === undefined || position.lng === undefined) return;
    const key = String(markerKey);
    if (traceEnabled[key] !== true) return;
    const center = map.getCenter();
    if (!center) return;
    const dist = calculateDistanceMeters(center.lat(), center.lng(), position.lat, position.lng);
    if (dist >= distanceThresholdMeters) {
        map.panTo({ lat: position.lat, lng: position.lng });
    }
}

// Add point to vehicle path and update polyline
export function updateVehiclePath(markerKey, position) {
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
        // Update map visibility based on trace toggle for this specific device (default: false)
        const isTraceEnabled = traceEnabled[markerKey] === true;
        if (isTraceEnabled) {
            polylines[markerKey].setMap(map);
        } else {
            polylines[markerKey].setMap(null);
        }
    } else {
        // Check if trace is enabled for this specific device (default: false)
        const isTraceEnabled = traceEnabled[markerKey] === true;
        // Create new polyline with green color
        polylines[markerKey] = new google.maps.Polyline({
            path: pathArray,
            geodesic: true,
            strokeColor: '#00CC00', // Green color
            strokeOpacity: 0.8,
            strokeWeight: 3,
            map: isTraceEnabled ? map : null, // Only show if trace is enabled for this device
            zIndex: 1 // Below markers
        });
    }
}

// Clear path for a vehicle/device
export function clearVehiclePath(markerKey) {
    if (polylines[markerKey]) {
        polylines[markerKey].setMap(null);
        delete polylines[markerKey];
    }
    if (vehiclePaths[markerKey]) {
        delete vehiclePaths[markerKey];
    }
}

// Smoothly animate marker from current position to new position
export function animateMarkerPosition(marker, newPosition, markerKey = null, duration = 1500) {
    if (!marker || !map) return;
    
    // Find markerKey if not provided
    if (!markerKey) {
        markerKey = Object.keys(markers).find(key => markers[key] === marker);
    }
    
    // Use a fallback key if still not found (shouldn't happen in normal operation)
    if (!markerKey) {
        markerKey = 'unknown_' + Date.now() + '_' + Math.random();
    }
    // Use string form for lookups (traceEnabled keys are strings)
    const followKey = String(markerKey);
    
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
    const shouldFollow = traceEnabled[followKey] === true;
    const followPosition = () => {
        if (!shouldFollow) return;
        if (typeof endLat !== 'number' || typeof endLng !== 'number') return;
        map.panTo({ lat: endLat, lng: endLng });
    };
    
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
    
    // Immediately pan/center to keep view following when trace is enabled
    followPosition();
    
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

// Get label color based on map type
export function getLabelColor() {
    if (!map) return '#ffffff';
    const mapType = map.getMapTypeId();
    // White text for all map types (since we have background colors)
    return '#ffffff';
}

// Get label background color based on vehicle/device status
export function getLabelBackgroundColor(isMoving, isOnline) {
    if (!isOnline) {
        return 'transparent'; // No background for offline
    }
    if (isMoving) {
        return '#00CC00'; // Green when moving
    }
    return '#0076FF'; // Blue when standby
}

// Get label className based on status
export function getLabelClassName(baseClassName, isMoving, isOnline) {
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
export function applyLabelBackground(marker, isMoving, isOnline) {
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
                // Moving - Apply Sinotrack Button3D gradient and green shadow
                labelContainer.style.backgroundImage = 'linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0, rgba(100, 100, 100, 0.1) 40%, rgba(75, 75, 75, 0.1) 50%, rgba(50, 50, 50, 0.1) 60%, rgba(50, 50, 50, 0.2) 100%)';
                labelContainer.style.backgroundColor = '#00CC00'; // Base green color
                labelContainer.style.border = '1px solid #00CC00';
                labelContainer.style.borderRadius = '3px';
                labelContainer.style.padding = '2px 6px';
                labelContainer.style.display = 'inline-block';
                labelContainer.style.filter = 'drop-shadow(0 0 0 #00cc00) drop-shadow(0 4px 8px rgba(0, 204, 0, 0.3)) drop-shadow(0 6px 16px rgba(0, 204, 0, 0.1))';
            } else {
                // Standby - Apply Sinotrack Button3D gradient and FShadow_Blue
                labelContainer.style.backgroundImage = 'linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0, rgba(100, 100, 100, 0.1) 40%, rgba(75, 75, 75, 0.1) 50%, rgba(50, 50, 50, 0.1) 60%, rgba(50, 50, 50, 0.2) 100%)';
                labelContainer.style.backgroundColor = '#0076FF'; // Base blue color
                labelContainer.style.border = '1px solid #0076FF';
                labelContainer.style.borderRadius = '3px';
                labelContainer.style.padding = '2px 6px';
                labelContainer.style.display = 'inline-block';
                labelContainer.style.filter = 'drop-shadow(0 0 0 #0076ff) drop-shadow(0 4px 8px rgba(45, 140, 240, 0.3)) drop-shadow(0 6px 16px rgba(45, 140, 240, 0.1))';
            }
        } else {
            // Offline - Apply Sinotrack Button3D gradient with gray/dark color
            labelContainer.style.backgroundImage = 'linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0, rgba(100, 100, 100, 0.1) 40%, rgba(75, 75, 75, 0.1) 50%, rgba(50, 50, 50, 0.1) 60%, rgba(50, 50, 50, 0.2) 100%)';
            labelContainer.style.backgroundColor = '#666666'; // Gray for offline
            labelContainer.style.border = '1px solid #666666';
            labelContainer.style.borderRadius = '3px';
            labelContainer.style.padding = '2px 6px';
            labelContainer.style.display = 'inline-block';
            labelContainer.style.filter = 'drop-shadow(0 0 0 #666666) drop-shadow(0 4px 8px rgba(102, 102, 102, 0.3)) drop-shadow(0 6px 16px rgba(102, 102, 102, 0.1))';
        }
    }
}

// Update all marker label colors based on current map type
export function updateMarkerLabelColors() {
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
export function updateMapMarkers() {
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
        // Clear markerAnimations object
        Object.keys(markerAnimations).forEach(key => delete markerAnimations[key]);
        
        // Clear all polylines
        Object.keys(polylines).forEach(key => {
            if (polylines[key]) {
                polylines[key].setMap(null);
            }
            delete polylines[key];
        });
        // Clear vehiclePaths
        Object.keys(vehiclePaths).forEach(key => delete vehiclePaths[key]);
        
        Object.values(markers).forEach(marker => marker.setMap(null));
        // Clear markers object
        Object.keys(markers).forEach(key => delete markers[key]);
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
                        scaledSize: new google.maps.Size(36, 36),
                        labelOrigin: new google.maps.Point(18, 50)
                    });
                    markers[vehicle.id].setLabel({
                        text: vehicle.modelName || vehicle.plateNumber.substring(0, 8),
                        color: '#FFFFFF', // White text
                        fontSize: '14px',
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: 'normal',
                        className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
                    });
                    
                    // Apply background styling
                    applyLabelBackground(markers[vehicle.id], vehicle.isMoving || false, vehicle.isOnline);
                }
                
                // Auto-follow even if marker didn't move (user may have panned away)
                followTraceTarget(vehicle.id, position);
                return; // Skip creating new marker
            }
            
            // Create marker with label below (only for new markers)
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: `${vehicle.modelName} - ${vehicle.plateNumber}`,
                label: {
                    text: vehicle.modelName || vehicle.plateNumber.substring(0, 8),
                    color: '#FFFFFF', // White text
                    fontSize: '14px',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'normal',
                    className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
                },
                icon: {
                    url: getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false),
                    scaledSize: new google.maps.Size(36, 36),
                    labelOrigin: new google.maps.Point(18, 50) // Position label below marker
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
                    setCurrentInfoWindow(null);
                }
            });
            
            marker.addListener('click', async () => {
                // Close any previously open InfoWindow
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                setCurrentInfoWindow(infoWindow);
                infoWindow.open(map, marker);
                
                // Fetch address if location is available
                if (vehicle.location && vehicle.location.lat && vehicle.location.lng) {
                    const address = await getAddressFromCoordinates(vehicle.location.lat, vehicle.location.lng);
                    if (address) {
                        // Update InfoWindow content with address
                        const addressElement = document.getElementById(`address_${vehicle.id}`);
                        if (addressElement) {
                            addressElement.textContent = address;
                        } else {
                            // If element doesn't exist yet, regenerate content
                            infoWindow.setContent(generateVehicleInfoWindowContent(vehicle, address));
                        }
                    }
                }
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
            
            // Auto-follow on creation when trace is enabled
            followTraceTarget(vehicle.id, position);
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
                
                // Auto-follow even if marker didn't move (user may have panned away)
                followTraceTarget(markerKey, position);
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
                    url: getMarkerIconUrl(device.isOnline, device.isMoving || false),
                    scaledSize: new google.maps.Size(40, 40),
                    labelOrigin: new google.maps.Point(20, 55) // Position label below marker
                },
                animation: useDropAnimation ? google.maps.Animation.DROP : null
            });
            
            // Create info window using helper function
            const infoWindow = new google.maps.InfoWindow({
                content: generateGpsDeviceInfoWindowContent(device)
            });
            
            // Listen for InfoWindow close event
            google.maps.event.addListener(infoWindow, 'closeclick', () => {
                if (currentInfoWindow === infoWindow) {
                    setCurrentInfoWindow(null);
                }
            });
            
            marker.addListener('click', async () => {
                // Close any previously open InfoWindow
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                setCurrentInfoWindow(infoWindow);
                infoWindow.open(map, marker);
                
                // Fetch address if location is available
                if (device.location && device.location.lat && device.location.lng) {
                    const address = await getAddressFromCoordinates(device.location.lat, device.location.lng);
                    if (address) {
                        // Update InfoWindow content with address
                        const addressElement = document.getElementById(`address_gps_${device.deviceId}`);
                        if (addressElement) {
                            addressElement.textContent = address;
                        } else {
                            // If element doesn't exist yet, regenerate content
                            infoWindow.setContent(generateGpsDeviceInfoWindowContent(device, address));
                        }
                    }
                }
            });
            
            markers[markerKey] = marker;
            infoWindows[markerKey] = infoWindow;
            
            // Apply background styling to label
            setTimeout(() => {
                applyLabelBackground(marker, device.isMoving || false, device.isOnline);
            }, 100);
            
            // Initialize path with current position if it doesn't exist
            if (!vehiclePaths[markerKey]) {
                updateVehiclePath(markerKey, position);
            }
            
            // Auto-follow on creation when trace is enabled
            followTraceTarget(markerKey, position);
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
            if (map.getZoom() > 15) {
                map.setZoom(15);
            }
        });
        
        setIsFirstMapLoad(false); // Mark that first load is complete
    }
}

