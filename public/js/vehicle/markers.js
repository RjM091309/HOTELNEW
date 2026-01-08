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
import {
    MOVEMENT_THRESHOLD_METERS,
    PATH_POINT_DISTANCE_METERS,
    MAX_PATH_POINTS,
    TRACE_FOLLOW_DISTANCE_METERS,
    DEFAULT_ANIMATION_DURATION_MS,
    MIN_ANIMATION_DURATION_MS,
    MAX_ANIMATION_DURATION_MS,
    ANIMATION_DISTANCE_FACTOR,
    MARKER_ROTATION_RETRY_DELAY_MS,
    MARKER_ROTATION_RETRY_DELAY_LONG_MS,
    MARKER_ICON_UPDATE_DELAY_MS,
    MARKER_LABEL_UPDATE_DELAY_MS,
    VEHICLE_MARKER_SIZE,
    GPS_MARKER_SIZE,
    VEHICLE_LABEL_ORIGIN_X,
    VEHICLE_LABEL_ORIGIN_Y,
    GPS_LABEL_ORIGIN_X,
    GPS_LABEL_ORIGIN_Y,
    MARKER_ICON_MIN_SIZE,
    PATH_STROKE_OPACITY,
    PATH_STROKE_WEIGHT,
    PATH_Z_INDEX,
    MAX_MAP_ZOOM,
    COORDINATE_PRECISION,
    COORDINATE_MULTIPLIER,
    HEADING_TOLERANCE_DEGREES,
    HEADING_SMOOTH_THRESHOLD_DEGREES,
    HEADING_SMOOTHING_FACTOR
} from './constants.js';
import { logWarn, logDebug } from './logger.js';

// Store marker DOM element references using WeakMap
const markerDomCache = new WeakMap();

// Store current heading for each marker (for smooth rotation interpolation)
const markerCurrentHeading = new WeakMap();

// Clear cache for a marker (call when icon changes)
export function clearMarkerRotationCache(marker) {
    if (marker) {
        markerDomCache.delete(marker);
        markerCurrentHeading.delete(marker); // Also clear heading cache
    }
}

// Cache marker DOM element when marker is created (optimization)
// This avoids expensive DOM queries during rotation
export function cacheMarkerDomElement(marker) {
    if (!marker || markerDomCache.has(marker)) {
        return; // Already cached or invalid marker
    }
    
    try {
        // Get marker's DOM element using Google Maps API
        const markerDiv = marker.getDiv ? marker.getDiv() : null;
        if (!markerDiv) {
            // Marker not yet rendered, retry after delay
            setTimeout(() => cacheMarkerDomElement(marker), MARKER_ROTATION_RETRY_DELAY_MS);
            return;
        }
        
        // Find the actual marker icon image element
        // Strategy: Look for img elements with marker icon
        const allImgs = markerDiv.querySelectorAll('img');
        let targetImg = null;
        let maxSize = 0;
        
        for (let img of allImgs) {
            // Skip transparent placeholder
            if (img.src && img.src.includes('transparent.png')) {
                continue;
            }
            
            // Check if it's our marker icon
            if (img.src && (img.src.includes('gpsmarker') || img.src.includes('/img/gpsmarker'))) {
                // Get image dimensions to find the actual marker (not a small icon)
                const width = img.width || img.offsetWidth || parseInt(window.getComputedStyle(img).width) || 0;
                const height = img.height || img.offsetHeight || parseInt(window.getComputedStyle(img).height) || 0;
                const size = width * height;
                
                // Prefer larger images (actual marker icons are usually 36x36 or larger)
                if (size > maxSize && size >= MARKER_ICON_MIN_SIZE) {
                    maxSize = size;
                    targetImg = img;
                }
            }
        }
        
        if (targetImg) {
            markerDomCache.set(marker, targetImg);
        } else {
            // Fallback: cache the marker div itself
            markerDomCache.set(marker, markerDiv);
        }
        } catch (error) {
            logWarn('Error caching marker DOM element', error, 'Markers');
            // Continue without cache - will use fallback search
        }
}

// Rotate PNG marker icon based on heading (degrees). Assumes icon points north by default.
// Matches Sinotrack implementation: transform:rotate(deg) translateZ(0)
export function applyMarkerRotation(marker, heading, smooth = true) {
    if (!marker) {
        return;
    }
    // Allow heading 0 (north) - it's a valid heading
    if (heading === null || heading === undefined || (typeof heading !== 'number' && isNaN(heading))) {
        return;
    }
    
    // Normalize heading to 0-360 range (handle negative values or values > 360)
    heading = heading % 360;
    if (heading < 0) heading += 360;
    
    // Get current heading for smooth interpolation
    let currentHeading = markerCurrentHeading.get(marker);
    if (currentHeading === undefined || currentHeading === null) {
        currentHeading = heading; // First time, use target heading directly
        markerCurrentHeading.set(marker, heading);
    }
    
    // Check if heading actually changed (within tolerance to avoid floating point issues)
    const headingDiff = Math.abs(heading - currentHeading);
    const normalizedDiff = Math.min(headingDiff, 360 - headingDiff); // Handle wrap-around
    
    // If heading hasn't changed significantly, don't apply rotation
    if (normalizedDiff < HEADING_TOLERANCE_DEGREES) {
        return; // No change, skip rotation
    }
    
    // Smooth heading interpolation to avoid jittery rotation
    // Only smooth if difference is significant (more than 1 degree)
    if (smooth) {
        // Calculate shortest rotation path (handle 360/0 wrap-around)
        let diff = heading - currentHeading;
        if (diff > 180) {
            diff -= 360;
        } else if (diff < -180) {
            diff += 360;
        }
        
        // Only apply smoothing if difference is significant
        if (Math.abs(diff) > HEADING_SMOOTH_THRESHOLD_DEGREES) {
            // Smooth interpolation: move towards target each frame
            // Lower value = smoother rotation, less jittery
            // This creates gradual rotation instead of instant snapping
            currentHeading += diff * HEADING_SMOOTHING_FACTOR;
            
            // Normalize to 0-360
            if (currentHeading < 0) currentHeading += 360;
            if (currentHeading >= 360) currentHeading -= 360;
            
            // Store current heading for next frame
            markerCurrentHeading.set(marker, currentHeading);
            
            // Use interpolated heading for rotation
            heading = currentHeading;
        } else {
            // Very small difference, snap to target to avoid micro-movements
            markerCurrentHeading.set(marker, heading);
        }
    } else {
        // No smoothing - use heading directly
        markerCurrentHeading.set(marker, heading);
    }
    
    // Check if we have cached DOM element (optimized path)
    let targetEl = markerDomCache.get(marker);
    
    // If not cached, try to cache it now (fallback for markers created before optimization)
    if (!targetEl) {
        // Try to get marker div directly (fastest method)
        try {
            const markerDiv = marker.getDiv ? marker.getDiv() : null;
            if (markerDiv) {
                // Find marker icon image in marker div
                const allImgs = markerDiv.querySelectorAll('img');
                for (let img of allImgs) {
                    if (img.src && !img.src.includes('transparent.png')) {
                        if (img.src.includes('gpsmarker') || img.src.includes('/img/gpsmarker')) {
                            const width = img.width || img.offsetWidth || parseInt(window.getComputedStyle(img).width) || 0;
                            const height = img.height || img.offsetHeight || parseInt(window.getComputedStyle(img).height) || 0;
                            const size = width * height;
                            
                            if (size >= 100) { // At least 10x10 pixels
                                targetEl = img;
                                markerDomCache.set(marker, targetEl);
                                break;
                            }
                        }
                    }
                }
                
                // Fallback: cache marker div if no image found
                if (!targetEl) {
                    targetEl = markerDiv;
                    markerDomCache.set(marker, targetEl);
                }
            }
        } catch (error) {
            console.warn('Error finding marker DOM (fallback):', error);
            // If still not found, retry after delay (marker might not be rendered yet)
            setTimeout(() => applyMarkerRotation(marker, heading), 200);
            return;
        }
    }
    
    // Apply rotation if we found the target element
    if (targetEl) {
        // Apply rotation to the image element
        targetEl.style.setProperty('transform', `rotate(${heading}deg) translateZ(0)`, 'important');
        targetEl.style.setProperty('transform-origin', '50% 50%', 'important');
        targetEl.style.setProperty('will-change', 'transform', 'important');
        
        // Also set directly as fallback
        targetEl.style.transform = `rotate(${heading}deg) translateZ(0)`;
        targetEl.style.transformOrigin = '50% 50%';
        targetEl.style.willChange = 'transform';
        
        // Also try rotating the parent container (Google Maps might render differently)
        const parent = targetEl.parentElement;
        const mapContainerEl = document.getElementById('map');
        if (parent && parent !== mapContainerEl) {
            parent.style.setProperty('transform', `rotate(${heading}deg) translateZ(0)`, 'important');
            parent.style.setProperty('transform-origin', '50% 50%', 'important');
        }
        
        // Rotation successfully applied
    } else {
        // Not found yet, retry after delay (marker might not be rendered yet)
        setTimeout(() => applyMarkerRotation(marker, heading), MARKER_ROTATION_RETRY_DELAY_LONG_MS);
    }
}

// Keep map centered on a target when trace is enabled
function followTraceTarget(markerKey, position, distanceThresholdMeters = TRACE_FOLLOW_DISTANCE_METERS) {
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
    
    // Add new point to path history if it's far enough from last point
    let shouldAddToPath = true;
    if (pathLength > 0) {
        const lastPoint = path[pathLength - 1];
        const distance = calculateDistanceMeters(
            lastPoint.lat,
            lastPoint.lng,
            position.lat,
            position.lng
        );
        
        // Only add point to path history if it's at least configured distance away
        if (distance < PATH_POINT_DISTANCE_METERS) {
            shouldAddToPath = false; // Too close, skip adding to path history
        }
    }
    
    // Add new point to path history if distance is sufficient
    if (shouldAddToPath) {
        path.push({ lat: position.lat, lng: position.lng });
        
        // Limit path to configured max points to avoid performance issues
        if (path.length > MAX_PATH_POINTS) {
            path.shift(); // Remove oldest point
        }
    }
    
    // Create or update polyline - always ensure last point is exactly at current marker position
    const pathArray = path.map(p => new google.maps.LatLng(p.lat, p.lng));
    
    // Always add current position as the last point to ensure polyline reaches marker
    // This ensures the line is always connected to the marker
    // Only add if it's different from the last point to avoid duplicates
    const currentLatLng = new google.maps.LatLng(position.lat, position.lng);
    if (pathArray.length === 0 || 
        pathArray[pathArray.length - 1].lat() !== position.lat || 
        pathArray[pathArray.length - 1].lng() !== position.lng) {
        pathArray.push(currentLatLng);
    } else {
        // Update last point to exact current position
        pathArray[pathArray.length - 1] = currentLatLng;
    }
    
    if (polylines[markerKey]) {
        // Update existing polyline - ensure it's green and path reaches marker
        polylines[markerKey].setPath(pathArray);
        polylines[markerKey].setOptions({
            strokeColor: '#00CC00', // Green color
            strokeOpacity: PATH_STROKE_OPACITY
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
            strokeOpacity: PATH_STROKE_OPACITY,
            strokeWeight: PATH_STROKE_WEIGHT,
            map: isTraceEnabled ? map : null, // Only show if trace is enabled for this device
            zIndex: PATH_Z_INDEX // Below markers
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
// Uses linear interpolation for smooth continuous movement (like Grab/Foodpanda)
export function animateMarkerPosition(marker, newPosition, markerKey = null, duration = DEFAULT_ANIMATION_DURATION_MS, heading = null) {
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
    
    // If there's an existing animation, smoothly transition from current animated position
    let startLat, startLng;
    if (markerAnimations[markerKey]) {
        // Get current animated position (not marker position, which might be stale)
        const animState = markerAnimations[markerKey];
        const elapsed = performance.now() - animState.startTime;
        const progress = Math.min(elapsed / animState.duration, 1);
        
        // Calculate current animated position
        const currentAnimLat = animState.startLat + (animState.endLat - animState.startLat) * progress;
        const currentAnimLng = animState.startLng + (animState.endLng - animState.startLng) * progress;
        
        startLat = currentAnimLat;
        startLng = currentAnimLng;
        
        // Cancel existing animation
        if (markerAnimations[markerKey].animationId) {
            try {
                cancelAnimationFrame(markerAnimations[markerKey].animationId);
            } catch (error) {
                logWarn('Error cancelling existing animation frame', error, 'Markers');
            }
        }
    } else {
        // No existing animation, use marker's current position
        const currentPos = marker.getPosition();
        if (!currentPos) {
            // No current position, just set directly
            marker.setPosition(newPosition);
            return;
        }
        startLat = currentPos.lat();
        startLng = currentPos.lng();
    }
    
    const endLat = newPosition.lat;
    const endLng = newPosition.lng;
    const shouldFollow = traceEnabled[followKey] === true;
    const followPosition = () => {
        if (!shouldFollow) return;
        if (typeof endLat !== 'number' || typeof endLng !== 'number') return;
        map.panTo({ lat: endLat, lng: endLng });
    };
    
    // Calculate distance to determine duration
    const distanceMeters = calculateDistanceMeters(startLat, startLng, endLat, endLng);
    
    // If duration was provided, use it; otherwise calculate based on distance
    // For smooth movement: use provided duration, or calculate from distance
    let animationDuration = duration;
    if (duration === DEFAULT_ANIMATION_DURATION_MS) {
        // Default duration - calculate based on distance
        // Uses configured distance factor with min and max limits
        animationDuration = Math.min(Math.max(distanceMeters / ANIMATION_DISTANCE_FACTOR * 1000, MIN_ANIMATION_DURATION_MS), MAX_ANIMATION_DURATION_MS);
    }
    
    const startTime = performance.now();
    
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
        // Check if animation was cancelled or marker/map is invalid
        if (!markerAnimations[markerKey] || !marker || !map) {
            // Clean up if marker or map is gone
            if (markerAnimations[markerKey]) {
                if (markerAnimations[markerKey].animationId) {
                    cancelAnimationFrame(markerAnimations[markerKey].animationId);
                }
                delete markerAnimations[markerKey];
            }
            return;
        }
        
        try {
            const elapsed = currentTime - animationState.startTime;
            const progress = Math.min(elapsed / animationState.duration, 1);
            
            // Use LINEAR interpolation for smooth continuous movement (like Grab/Foodpanda)
            // No easing - linear movement looks more natural for vehicles
            const currentLat = startLat + (endLat - startLat) * progress;
            const currentLng = startLng + (endLng - startLng) * progress;
            
            // Update marker position (with error handling)
            try {
                marker.setPosition({ lat: currentLat, lng: currentLng });
            } catch (positionError) {
                // Marker might be invalid, clean up and exit
                logWarn('Error setting marker position during animation', positionError, 'Markers');
                if (markerAnimations[markerKey]) {
                    if (markerAnimations[markerKey].animationId) {
                        cancelAnimationFrame(markerAnimations[markerKey].animationId);
                    }
                    delete markerAnimations[markerKey];
                }
                return;
            }
            
            // Apply rotation if heading is available (for smooth rotation during movement)
            // Apply on every frame for smooth rotation
            if (heading !== null && heading !== undefined && !isNaN(heading)) {
                try {
                    applyMarkerRotation(marker, heading);
                } catch (rotationError) {
                    // Rotation error is non-critical, log and continue
                    logWarn('Error applying marker rotation during animation', rotationError, 'Markers');
                }
            }
            
            // Update polyline visually during animation (without adding to path history)
            if (polylines[markerKey] && vehiclePaths[markerKey]) {
                try {
                    const pathArray = vehiclePaths[markerKey].map(p => new google.maps.LatLng(p.lat, p.lng));
                    // Add current animated position as last point for visual connection
                    pathArray.push(new google.maps.LatLng(currentLat, currentLng));
                    polylines[markerKey].setPath(pathArray);
                } catch (polylineError) {
                    // Polyline error is non-critical, log and continue
                    logWarn('Error updating polyline during animation', polylineError, 'Markers');
                }
            }
            
            if (progress < 1) {
                // Continue animation
                try {
                    animationState.animationId = requestAnimationFrame(animate);
                } catch (rafError) {
                    // Failed to request next frame, clean up
                    logError('Error requesting animation frame', rafError, 'Markers');
                    delete markerAnimations[markerKey];
                    return;
                }
            } else {
                // Animation complete - ensure final position is exact
                try {
                    marker.setPosition(newPosition);
                } catch (finalPositionError) {
                    logWarn('Error setting final marker position', finalPositionError, 'Markers');
                }
                
                // Clean up animation state
                delete markerAnimations[markerKey];
                
                // Final path update to ensure exact connection (only add final position to history)
                try {
                    updateVehiclePath(markerKey, newPosition);
                } catch (pathError) {
                    logWarn('Error updating vehicle path after animation', pathError, 'Markers');
                }
            }
        } catch (error) {
            // Catch any unexpected errors and clean up
            logError('Unexpected error in animation loop', error, 'Markers');
            if (markerAnimations[markerKey]) {
                if (markerAnimations[markerKey].animationId) {
                    cancelAnimationFrame(markerAnimations[markerKey].animationId);
                }
                delete markerAnimations[markerKey];
            }
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

// ========================================
// COMMON MARKER HELPER FUNCTIONS
// ========================================

/**
 * Check if marker position has changed significantly
 * @param {google.maps.Marker} marker - The marker to check
 * @param {Object} newPosition - New position {lat, lng}
 * @param {boolean} checkIsMoving - Whether to check isMoving flag (for vehicles)
 * @param {boolean} isMoving - Whether entity is moving (for vehicles)
 * @returns {boolean} - True if position should be updated
 */
function shouldUpdateMarkerPosition(marker, newPosition, checkIsMoving = false, isMoving = false) {
    if (!marker) return false;
    
    // For vehicles, only update if isMoving is true
    if (checkIsMoving && !isMoving) {
        return false;
    }
    
    const currentPos = marker.getPosition();
    if (!currentPos) return true;
    
    // Round coordinates to avoid floating point precision issues
    const roundCoord = (coord) => Math.round(coord * COORDINATE_MULTIPLIER) / COORDINATE_MULTIPLIER;
    const roundedCurrentLat = roundCoord(currentPos.lat());
    const roundedCurrentLng = roundCoord(currentPos.lng());
    const roundedNewLat = roundCoord(newPosition.lat);
    const roundedNewLng = roundCoord(newPosition.lng);
    
    // Only update if coordinates are actually different
    if (roundedCurrentLat !== roundedNewLat || roundedCurrentLng !== roundedNewLng) {
        const distanceMeters = calculateDistanceMeters(
            roundedCurrentLat,
            roundedCurrentLng,
            roundedNewLat,
            roundedNewLng
        );
        return distanceMeters >= MOVEMENT_THRESHOLD_METERS;
    }
    
    return false;
}

/**
 * Calculate animation duration based on distance and speed
 * @param {Object} currentPos - Current position {lat, lng} or null
 * @param {Object} newPosition - New position {lat, lng}
 * @param {number} speedKph - Speed in km/h
 * @returns {number} - Duration in milliseconds
 */
function calculateAnimationDuration(currentPos, newPosition, speedKph) {
    if (!speedKph || speedKph <= 0) {
        return DEFAULT_ANIMATION_DURATION_MS;
    }
    
    const distanceMeters = calculateDistanceMeters(
        currentPos ? currentPos.lat : newPosition.lat,
        currentPos ? currentPos.lng : newPosition.lng,
        newPosition.lat,
        newPosition.lng
    );
    
    const speedMps = speedKph / 3.6; // km/h to m/s
    return Math.min(
        Math.max((distanceMeters / speedMps) * 1000, MIN_ANIMATION_DURATION_MS),
        MAX_ANIMATION_DURATION_MS
    );
}

/**
 * Update marker icon and label
 * @param {google.maps.Marker} marker - The marker to update
 * @param {string} iconUrl - New icon URL
 * @param {Object} labelConfig - Label configuration {text, fontSize, fontWeight, className}
 * @param {number} markerSize - Marker size (VEHICLE_MARKER_SIZE or GPS_MARKER_SIZE)
 * @param {number} labelOriginX - Label origin X
 * @param {number} labelOriginY - Label origin Y
 * @param {boolean} isOnline - Whether entity is online
 * @param {boolean} isMoving - Whether entity is moving
 * @param {number|null} heading - Heading angle (optional)
 */
function updateMarkerIconAndLabel(marker, iconUrl, labelConfig, markerSize, labelOriginX, labelOriginY, isOnline, isMoving, heading = null) {
    if (!marker) return;
    
    // Clear rotation cache when icon changes (DOM element will be recreated)
    clearMarkerRotationCache(marker);
    
    marker.setIcon({
        url: iconUrl,
        scaledSize: new google.maps.Size(markerSize, markerSize),
        labelOrigin: new google.maps.Point(labelOriginX, labelOriginY)
    });
    
    marker.setLabel({
        text: labelConfig.text,
        color: '#FFFFFF', // White text
        fontSize: labelConfig.fontSize || '14px',
        fontFamily: 'Arial, sans-serif',
        fontWeight: labelConfig.fontWeight || 'normal',
        className: labelConfig.className
    });
    
    // Apply background styling
    applyLabelBackground(marker, isMoving, isOnline);
    
    // Re-apply rotation after icon change (icon change recreates DOM element)
    if (heading !== null && heading !== undefined) {
        setTimeout(() => {
            if (marker) {
                applyMarkerRotation(marker, heading);
            }
        }, MARKER_ICON_UPDATE_DELAY_MS);
    }
}

/**
 * Create InfoWindow click handler
 * @param {google.maps.Marker} marker - The marker
 * @param {google.maps.InfoWindow} infoWindow - The InfoWindow
 * @param {Object} entity - Vehicle or GPS device object
 * @param {string} markerKey - Marker key (vehicleId or gps_deviceId)
 * @param {Function} generateContent - Function to generate InfoWindow content
 * @param {string} addressElementId - ID of address element in InfoWindow
 */
function createInfoWindowClickHandler(marker, infoWindow, entity, markerKey, generateContent, addressElementId) {
    marker.addListener('click', async () => {
        // Close any previously open InfoWindow
        if (currentInfoWindow) {
            currentInfoWindow.close();
        }
        setCurrentInfoWindow(infoWindow);
        infoWindow.open(map, marker);
        
        // Fetch address if location is available
        if (entity.location && entity.location.lat && entity.location.lng) {
            const address = await getAddressFromCoordinates(entity.location.lat, entity.location.lng);
            if (address) {
                // Update InfoWindow content with address
                const addressElement = document.getElementById(addressElementId);
                if (addressElement) {
                    addressElement.textContent = address;
                } else {
                    // If element doesn't exist yet, regenerate content
                    infoWindow.setContent(generateContent(entity, address));
                }
            }
        }
    });
}

/**
 * Sync marker position on first load
 * @param {google.maps.Marker} marker - The marker
 * @param {Object} newPosition - New position {lat, lng}
 * @param {string} entityId - Entity ID for logging
 * @param {string} entityName - Entity name for logging
 */
function syncMarkerPositionOnFirstLoad(marker, newPosition, entityId, entityName) {
    if (!isFirstMapLoad || !marker) return;
    
    const currentPos = marker.getPosition();
    if (!currentPos) return;
    
    const roundCoord = (coord) => Math.round(coord * COORDINATE_MULTIPLIER) / COORDINATE_MULTIPLIER;
    const roundedCurrentLat = roundCoord(currentPos.lat());
    const roundedCurrentLng = roundCoord(currentPos.lng());
    const roundedNewLat = roundCoord(newPosition.lat);
    const roundedNewLng = roundCoord(newPosition.lng);
    
    // If position differs, update it (first load sync)
    if (roundedCurrentLat !== roundedNewLat || roundedCurrentLng !== roundedNewLng) {
        marker.setPosition(newPosition);
        logDebug(`First load: Synced marker position for ${entityName || entityId || 'unknown'}`, null, 'Markers');
    }
}

// ========================================
// MAIN MARKER UPDATE FUNCTION
// ========================================

// Update map markers
export function updateMapMarkers() {
    if (!map) return;
    
    // Only use DROP animation on first load
    const useDropAnimation = isFirstMapLoad;
    
    // Remove old markers only if this is a full refresh
    if (isFirstMapLoad) {
        // Cancel all active animations and clean up
        Object.keys(markerAnimations).forEach(key => {
            if (markerAnimations[key]) {
                if (markerAnimations[key].animationId) {
                    try {
                        cancelAnimationFrame(markerAnimations[key].animationId);
                    } catch (error) {
                        logWarn('Error cancelling animation frame on first load', error, 'Markers');
                    }
                }
                delete markerAnimations[key];
            }
        });
        
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
            const vehicleId = String(vehicle.id); // Use string ID for consistency
            
            // Check if marker already exists
            if (markers[vehicleId]) {
                const marker = markers[vehicleId];
                if (!marker) return; // Null safety check
                
                const currentPos = marker.getPosition();
                
                // Sync position on first load
                syncMarkerPositionOnFirstLoad(marker, position, vehicleId, vehicle.plateNumber);
                
                // Check if position should be updated (only if vehicle is moving)
                const shouldUpdatePosition = shouldUpdateMarkerPosition(marker, position, true, vehicle.isMoving);
                
                // Animate marker if position changed and vehicle is moving
                if (shouldUpdatePosition) {
                    const duration = calculateAnimationDuration(
                        currentPos ? { lat: currentPos.lat(), lng: currentPos.lng() } : null,
                        position,
                        vehicle.location?.speed || 0
                    );
                    animateMarkerPosition(marker, position, vehicleId, duration, vehicle.location?.heading);
                }
                
                // Update icon/label if status changed
                const currentIconUrl = marker.getIcon()?.url || '';
                const newIconUrl = getMarkerIconUrl(vehicle.isOnline, vehicle.isMoving || false);
                const iconChanged = currentIconUrl !== newIconUrl;
                
                if (iconChanged) {
                    updateMarkerIconAndLabel(
                        marker,
                        newIconUrl,
                        {
                            text: vehicle.modelName || vehicle.plateNumber.substring(0, 8),
                            fontSize: '14px',
                            fontWeight: 'normal',
                            className: getLabelClassName('vehicle-marker-label', vehicle.isMoving || false, vehicle.isOnline)
                        },
                        VEHICLE_MARKER_SIZE,
                        VEHICLE_LABEL_ORIGIN_X,
                        VEHICLE_LABEL_ORIGIN_Y,
                        vehicle.isOnline,
                        vehicle.isMoving || false,
                        vehicle.location?.heading
                    );
                }

                // Apply heading-based rotation if heading available (always re-apply)
                if (vehicle.location && vehicle.location.heading !== null && vehicle.location.heading !== undefined) {
                    applyMarkerRotation(marker, vehicle.location.heading);
                }
                
                // Auto-follow even if marker didn't move (user may have panned away)
                followTraceTarget(vehicleId, position);
                return; // Skip creating new marker
            }
            
            // Create marker with label below (only for new markers)
            // vehicleId already declared above at line 614
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
                    scaledSize: new google.maps.Size(VEHICLE_MARKER_SIZE, VEHICLE_MARKER_SIZE),
                    labelOrigin: new google.maps.Point(VEHICLE_LABEL_ORIGIN_X, VEHICLE_LABEL_ORIGIN_Y) // Position label below marker
                },
                animation: useDropAnimation ? google.maps.Animation.DROP : null
            });
            
            // Cache marker DOM element for optimized rotation (performance optimization)
            setTimeout(() => {
                cacheMarkerDomElement(marker);
                applyLabelBackground(marker, vehicle.isMoving || false, vehicle.isOnline);
                if (vehicle.location && vehicle.location.heading !== null && vehicle.location.heading !== undefined) {
                    applyMarkerRotation(marker, vehicle.location.heading);
                }
            }, MARKER_LABEL_UPDATE_DELAY_MS);
            
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
            
            // Create click handler
            createInfoWindowClickHandler(
                marker,
                infoWindow,
                vehicle,
                vehicleId,
                generateVehicleInfoWindowContent,
                `address_${vehicleId}`
            );
            
            // Store InfoWindow for this vehicle (use string ID)
            infoWindows[vehicleId] = infoWindow;
            markers[vehicleId] = marker;
            
            // Apply background styling to label
            setTimeout(() => {
                applyLabelBackground(marker, vehicle.isMoving || false, vehicle.isOnline);
            }, MARKER_LABEL_UPDATE_DELAY_MS);
            
            // Initialize path with current position if it doesn't exist
            if (!vehiclePaths[vehicleId]) {
                updateVehiclePath(vehicleId, position);
            }
            
            // Auto-follow on creation when trace is enabled
            followTraceTarget(vehicleId, position);
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
                if (markerAnimations[markerKey]) {
                    if (markerAnimations[markerKey].animationId) {
                        try {
                            cancelAnimationFrame(markerAnimations[markerKey].animationId);
                        } catch (error) {
                            logWarn('Error cancelling animation frame for GPS device', error, 'Markers');
                        }
                    }
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
                const marker = markers[markerKey];
                if (!marker) return; // Null safety check
                
                const currentPos = marker.getPosition();
                
                // Check if position should be updated (GPS devices always check position, no isMoving flag)
                const positionChanged = shouldUpdateMarkerPosition(marker, position, false, false);
                
                // Animate marker if position changed
                if (positionChanged) {
                    const duration = calculateAnimationDuration(
                        currentPos ? { lat: currentPos.lat(), lng: currentPos.lng() } : null,
                        position,
                        device.location?.speed || 0
                    );
                    animateMarkerPosition(marker, position, markerKey, duration, device.location?.heading);
                }
                
                // Check if icon/status changed
                const wasDeviceOnline = marker.getIcon()?.url?.includes('gpsmarker-1.png') || false;
                const deviceIconChanged = wasDeviceOnline !== device.isOnline;
                
                // Update icon/label if position changed OR status changed
                if (positionChanged || deviceIconChanged) {
                    updateMarkerIconAndLabel(
                        marker,
                        getMarkerIconUrl(device.isOnline, device.isMoving || false),
                        {
                            text: device.deviceId.substring(device.deviceId.length - 4) || 'GPS',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            className: getLabelClassName('gps-marker-label', device.isMoving || false, device.isOnline)
                        },
                        GPS_MARKER_SIZE,
                        GPS_LABEL_ORIGIN_X,
                        GPS_LABEL_ORIGIN_Y,
                        device.isOnline,
                        device.isMoving || false,
                        device.location?.heading
                    );
                }
                
                // Apply heading-based rotation if heading available (always re-apply)
                if (device.location && device.location.heading !== null && device.location.heading !== undefined) {
                    applyMarkerRotation(marker, device.location.heading);
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
                    scaledSize: new google.maps.Size(GPS_MARKER_SIZE, GPS_MARKER_SIZE),
                    labelOrigin: new google.maps.Point(GPS_LABEL_ORIGIN_X, GPS_LABEL_ORIGIN_Y) // Position label below marker
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
            
            // Create click handler
            createInfoWindowClickHandler(
                marker,
                infoWindow,
                device,
                markerKey,
                generateGpsDeviceInfoWindowContent,
                `address_gps_${device.deviceId}`
            );
            
            markers[markerKey] = marker;
            infoWindows[markerKey] = infoWindow;
            
            // Cache marker DOM element for optimized rotation (performance optimization)
            setTimeout(() => {
                cacheMarkerDomElement(marker);
                applyLabelBackground(marker, device.isMoving || false, device.isOnline);
                if (device.location && device.location.heading !== null && device.location.heading !== undefined) {
                    applyMarkerRotation(marker, device.location.heading);
                }
            }, MARKER_LABEL_UPDATE_DELAY_MS);
            
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
            if (map.getZoom() > MAX_MAP_ZOOM) {
                map.setZoom(MAX_MAP_ZOOM);
            }
        });
        
        setIsFirstMapLoad(false); // Mark that first load is complete
    }
}

