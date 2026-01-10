// ========================================
// REPLAY FUNCTIONALITY - Vehicle Monitoring
// ========================================

import { map, markers, vehicleData, gpsDevicesData } from './state.js';
import { formatDateFullPH, calculateDistanceMeters, snapToRoad, snapToRoadsBatch, calculateBearing } from './utils.js';
import { animateMarkerPosition, applyMarkerRotation, getLabelClassName, applyLabelBackground, clearMarkerRotationCache } from './markers.js';
import { getMarkerIconUrl } from './status.js';

let replayState = {
    isPlaying: false,
    currentIndex: 0,
    locations: [],
    replayMarker: null,
    replayPolyline: null,
    playbackSpeed: 1, // 1x, 2x, 4x, etc.
    intervalId: null,
    vehicleId: null,
    deviceId: null,
    isVehicle: true,
    markerKey: null, // Store marker key (vehicleId or 'gps_' + deviceId)
    originalPosition: null, // Store original marker position to restore after replay
    originalIcon: null, // Store original icon to restore after replay
    originalLabel: null // Store original label to restore after replay
};

// Initialize replay overlay (call this once on page load)
export function initReplayModal() {
    // Check if overlay already exists
    if (document.getElementById('replayOverlay')) {
        return;
    }

    // Get map container
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Create replay overlay HTML
    const overlayHTML = `
        <div id="replayOverlay" style="display: none; position: absolute; top: 10px; right: 10px; z-index: 1000; background: rgba(255, 255, 255, 0.95); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); min-width: 320px; max-width: 400px; max-height: 90vh; overflow-y: auto;">
            <div style="padding: 16px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                <h5 style="margin: 0; font-size: 16px; font-weight: 600;">Replay Vehicle Route</h5>
                <button type="button" class="btn-close" onclick="stopReplay()" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; opacity: 0.5;" title="Close">×</button>
            </div>
            <div style="padding: 16px;">
                <div style="margin-bottom: 12px;">
                    <label for="replayStartDate" class="form-label" style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">Start Date</label>
                    <input type="date" class="form-control form-control-sm" id="replayStartDate" style="font-size: 13px;">
                </div>
                <div style="margin-bottom: 12px;">
                    <label for="replayEndDate" class="form-label" style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">End Date</label>
                    <input type="date" class="form-control form-control-sm" id="replayEndDate" style="font-size: 13px;">
                </div>
                <div style="margin-bottom: 12px;">
                    <label for="replaySpeed" class="form-label" style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">Playback Speed: <span id="replaySpeedLabel">1x</span></label>
                    <input type="range" class="form-range" id="replaySpeed" min="1" max="10" value="1" step="1" style="height: 6px;">
                </div>
                <div style="margin-bottom: 12px;">
                    <button type="button" class="btn btn-primary btn-sm" id="btnLoadReplay" onclick="loadReplayHistory()" style="width: 100%; font-size: 13px;">
                        <i class="fa fa-search"></i> Load History
                    </button>
                </div>
                <div id="replayInfo" class="alert alert-info" style="display: none; padding: 10px; margin-bottom: 12px; font-size: 12px;">
                    <p style="margin: 4px 0;"><strong>Total Points:</strong> <span id="replayTotalPoints">0</span></p>
                    <p style="margin: 4px 0;"><strong>Duration:</strong> <span id="replayDuration">-</span></p>
                    <p style="margin: 4px 0;"><strong>Distance:</strong> <span id="replayDistance">-</span></p>
                </div>
                <div id="replayControls" style="display: none;">
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <button type="button" class="btn btn-success btn-sm" id="btnPlayPause" onclick="toggleReplay()" style="flex: 1; font-size: 12px;">
                            <i class="fa fa-play"></i> Play
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="stopReplay()" style="flex: 1; font-size: 12px;">
                            <i class="fa fa-stop"></i> Stop
                        </button>
                        <button type="button" class="btn btn-info btn-sm" onclick="resetReplay()" style="flex: 1; font-size: 12px;">
                            <i class="fa fa-undo"></i> Reset
                        </button>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 12px; margin-bottom: 4px; display: block;">Progress: <span id="replayProgress">0 / 0</span></label>
                        <div class="progress" style="height: 8px;">
                            <div class="progress-bar" id="replayProgressBar" role="progressbar" style="width: 0%"></div>
                        </div>
                    </div>
                    <div style="font-size: 12px; text-align: center; background: #f5f5f5; padding: 10px; border-radius: 4px;">
                        <p style="margin: 4px 0;"><strong>Current Time:</strong> <span id="replayCurrentTime">-</span></p>
                        <p style="margin: 4px 0;"><strong>Speed:</strong> <span id="replayCurrentSpeed">-</span></p>
                        <p style="margin: 4px 0;"><strong>Location:</strong> <span id="replayCurrentLocation">-</span></p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append overlay to map container
    mapContainer.insertAdjacentHTML('beforeend', overlayHTML);

    // Setup speed slider
    const speedSlider = document.getElementById('replaySpeed');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            const speed = parseInt(e.target.value);
            document.getElementById('replaySpeedLabel').textContent = `${speed}x`;
            replayState.playbackSpeed = speed;
            // Restart playback with new speed if playing
            if (replayState.isPlaying) {
                pauseReplay();
                setTimeout(() => playReplay(), 100);
            }
        });
    }
}

// Show replay modal for vehicle
export function showReplayForVehicle(vehicleId) {
    const vehicle = vehicleData[vehicleId];
    if (!vehicle || !vehicle.gpsDeviceId) {
        alert('Vehicle does not have a GPS device assigned.');
        return;
    }

    replayState.vehicleId = vehicleId;
    replayState.deviceId = vehicle.gpsDeviceId;
    replayState.isVehicle = true;

    // Ensure overlay is initialized
    if (!document.getElementById('replayOverlay')) {
        initReplayModal();
    }

    // Set default dates (today and 7 days ago)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Wait a bit for overlay to be ready, then set dates
    setTimeout(() => {
        const startDateInput = document.getElementById('replayStartDate');
        const endDateInput = document.getElementById('replayEndDate');
        
        if (startDateInput) {
            startDateInput.value = startDate.toISOString().split('T')[0];
        }
        if (endDateInput) {
            endDateInput.value = endDate.toISOString().split('T')[0];
        }
    }, 100);

    // Reset state
    resetReplayState();
    
    // Show overlay
    const overlayElement = document.getElementById('replayOverlay');
    if (overlayElement) {
        overlayElement.style.display = 'block';
    } else {
        console.error('Replay overlay not found');
        alert('Replay overlay not initialized. Please refresh the page.');
    }
}

// Show replay modal for GPS device
export function showReplayForDevice(deviceId) {
    replayState.vehicleId = null;
    replayState.deviceId = deviceId;
    replayState.isVehicle = false;

    // Ensure overlay is initialized
    if (!document.getElementById('replayOverlay')) {
        initReplayModal();
    }

    // Set default dates (today and 7 days ago)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Wait a bit for overlay to be ready, then set dates
    setTimeout(() => {
        const startDateInput = document.getElementById('replayStartDate');
        const endDateInput = document.getElementById('replayEndDate');
        
        if (startDateInput) {
            startDateInput.value = startDate.toISOString().split('T')[0];
        }
        if (endDateInput) {
            endDateInput.value = endDate.toISOString().split('T')[0];
        }
    }, 100);

    // Reset state
    resetReplayState();
    
    // Show overlay
    const overlayElement = document.getElementById('replayOverlay');
    if (overlayElement) {
        overlayElement.style.display = 'block';
    } else {
        console.error('Replay overlay not found');
        alert('Replay overlay not initialized. Please refresh the page.');
    }
}

// Load replay history
export async function loadReplayHistory() {
    if (!replayState.deviceId) {
        alert('No device selected');
        return;
    }

    const startDate = document.getElementById('replayStartDate').value;
    const endDate = document.getElementById('replayEndDate').value;

    if (!startDate || !endDate) {
        alert('Please select both start and end dates');
        return;
    }

    try {
        // Determine which endpoint to use
        let url;
        if (replayState.isVehicle && replayState.vehicleId) {
            url = `/vehicle/api/monitoring/vehicles/${replayState.vehicleId}/history?limit=1000`;
        } else {
            url = `/api/gps-tracker/history/${replayState.deviceId}?limit=1000`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Failed to load history');
        }

        let locations = data.data.locations || data.data || [];
        
        // Filter by date range if needed (backend might not support date filtering)
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Include entire end date
            
            locations = locations.filter(loc => {
                const locDate = new Date(loc.timestamp || loc.createdAt);
                return locDate >= start && locDate <= end;
            });
        }

        // Sort by timestamp ascending (oldest first for replay)
        locations.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt).getTime();
            const timeB = new Date(b.timestamp || b.createdAt).getTime();
            return timeA - timeB;
        });

        if (locations.length === 0) {
            alert('No location data found for the selected date range');
            return;
        }

        // Snap all coordinates to roads for accurate polyline and marker alignment
        // This ensures the marker stays on the polyline during replay
        try {
            // Prepare points for batch snapping (max 100 points per request)
            const pointsToSnap = locations
                .map(loc => {
                    const lat = parseFloat(loc.lat);
                    const lng = parseFloat(loc.lng);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        return { lat, lng };
                    }
                    return null;
                })
                .filter(point => point !== null);

            if (pointsToSnap.length > 0) {
                // Snap in batches of 100 (Google Roads API limit)
                const batchSize = 100;
                const snappedPoints = [];
                
                for (let i = 0; i < pointsToSnap.length; i += batchSize) {
                    const batch = pointsToSnap.slice(i, i + batchSize);
                    const batchSnapped = await snapToRoadsBatch(batch);
                    snappedPoints.push(...batchSnapped);
                }

                // Update locations with snapped coordinates
                // Map snapped points back to original locations array
                let snappedIndex = 0;
                locations = locations.map(loc => {
                    const lat = parseFloat(loc.lat);
                    const lng = parseFloat(loc.lng);
                    if (!isNaN(lat) && !isNaN(lng) && snappedIndex < snappedPoints.length) {
                        const snapped = snappedPoints[snappedIndex++];
                        return {
                            ...loc,
                            lat: snapped.lat,
                            lng: snapped.lng
                        };
                    }
                    return loc;
                });
            }
        } catch (error) {
            console.warn('Failed to snap replay coordinates to roads, using original coordinates:', error);
            // Continue with original coordinates if snapping fails
        }

        replayState.locations = locations;
        replayState.currentIndex = 0;

        // Calculate stats
        const duration = calculateDuration(locations);
        const distance = calculateDistance(locations);

        // Display stats
        document.getElementById('replayTotalPoints').textContent = locations.length;
        document.getElementById('replayDuration').textContent = formatDuration(duration);
        const distanceNum = typeof distance === 'number' ? distance : parseFloat(distance) || 0;
        document.getElementById('replayDistance').textContent = (isNaN(distanceNum) ? 0 : distanceNum).toFixed(2) + ' km';
        document.getElementById('replayInfo').style.display = 'block';
        document.getElementById('replayControls').style.display = 'block';

        // Create replay marker and polyline
        initializeReplayDisplay();

        // Reset to first position
        resetReplay();
    } catch (error) {
        console.error('Error loading replay history:', error);
        alert('Failed to load replay history: ' + error.message);
    }
}

// Initialize replay display (marker and polyline)
function initializeReplayDisplay() {
    if (!map) return;

    // Remove existing replay polyline if any
    if (replayState.replayPolyline) {
        replayState.replayPolyline.setMap(null);
        replayState.replayPolyline = null;
    }

    if (replayState.locations.length === 0) return;

    // Find the existing marker key
    let markerKey = null;
    if (replayState.isVehicle && replayState.vehicleId) {
        markerKey = String(replayState.vehicleId);
    } else if (replayState.deviceId) {
        markerKey = 'gps_' + replayState.deviceId;
    }

    if (!markerKey || !markers[markerKey]) {
        console.error('Marker not found for replay:', markerKey);
        return;
    }

    replayState.markerKey = markerKey;
    replayState.replayMarker = markers[markerKey];

    // Store original position, icon, and label
    const currentPos = replayState.replayMarker.getPosition();
    replayState.originalPosition = {
        lat: currentPos.lat(),
        lng: currentPos.lng()
    };
    replayState.originalIcon = replayState.replayMarker.getIcon();
    replayState.originalLabel = replayState.replayMarker.getLabel();

    // Move marker to first location
    const firstLoc = replayState.locations[0];
    const firstLat = parseFloat(firstLoc.lat);
    const firstLng = parseFloat(firstLoc.lng);
    
    if (isNaN(firstLat) || isNaN(firstLng)) {
        console.error('Invalid coordinates for replay marker');
        return;
    }

    // Set initial position (instant, no animation for start)
    replayState.replayMarker.setPosition({ lat: firstLat, lng: firstLng });
    
    // Update initial status based on first location's speed
    const firstSpeed = firstLoc.speed !== null && firstLoc.speed !== undefined ? parseFloat(firstLoc.speed) : 0;
    const isMoving = !isNaN(firstSpeed) && firstSpeed > 0;
    updateReplayMarkerStatus(replayState.replayMarker, markerKey, isMoving, true);

    // Create polyline for path (filter out invalid coordinates)
    const path = replayState.locations
        .map(loc => {
            const lat = parseFloat(loc.lat);
            const lng = parseFloat(loc.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                return { lat, lng };
            }
            return null;
        })
        .filter(point => point !== null);

    replayState.replayPolyline = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#FF0000',
        strokeOpacity: 0.6,
        strokeWeight: 3,
        map: map,
        zIndex: 1
    });

    // Fit map to bounds with padding
    const bounds = new google.maps.LatLngBounds();
    path.forEach(point => bounds.extend(point));
    map.fitBounds(bounds);
}

// Play replay
export function playReplay() {
    if (replayState.locations.length === 0) {
        alert('Please load history first');
        return;
    }

    if (replayState.currentIndex >= replayState.locations.length - 1) {
        // Reached the end, reset
        resetReplay();
    }

    replayState.isPlaying = true;
    document.getElementById('btnPlayPause').innerHTML = '<i class="fa fa-pause"></i> Pause';
    document.getElementById('btnPlayPause').classList.remove('btn-success');
    document.getElementById('btnPlayPause').classList.add('btn-warning');

    // Start replay loop - calculate interval dynamically for each step
    async function replayStep() {
        if (replayState.currentIndex >= replayState.locations.length - 1) {
            // Reached the end
            pauseReplay();
            return;
        }

        // Update to next position
        replayState.currentIndex++;
        await updateReplayPosition();
        
        // Calculate interval for next step based on current position
        const interval = calculatePlaybackInterval();
        
        // Schedule next step
        if (replayState.isPlaying) {
            replayState.intervalId = setTimeout(() => replayStep(), interval);
        }
    }
    
    // Start first step immediately, then schedule subsequent steps
    replayStep();
}

// Pause replay
export function pauseReplay() {
    replayState.isPlaying = false;
    if (replayState.intervalId) {
        // Can be either setTimeout or setInterval, try both
        clearTimeout(replayState.intervalId);
        clearInterval(replayState.intervalId);
        replayState.intervalId = null;
    }
    document.getElementById('btnPlayPause').innerHTML = '<i class="fa fa-play"></i> Play';
    document.getElementById('btnPlayPause').classList.remove('btn-warning');
    document.getElementById('btnPlayPause').classList.add('btn-success');
}

// Toggle play/pause
export function toggleReplay() {
    if (replayState.isPlaying) {
        pauseReplay();
    } else {
        playReplay();
    }
}

// Stop replay
export function stopReplay() {
    pauseReplay();
    resetReplay();
}

// Reset replay to start
export async function resetReplay() {
    pauseReplay();
    replayState.currentIndex = 0;
    await updateReplayPosition();
    document.getElementById('replayProgress').textContent = '0 / ' + replayState.locations.length;
    document.getElementById('replayProgressBar').style.width = '0%';
}

// Reset replay state
function resetReplayState() {
    stopReplay();
    
    // Restore original marker position, icon, and label if we were in replay mode
    if (replayState.replayMarker && replayState.originalPosition) {
        replayState.replayMarker.setPosition(replayState.originalPosition);
        if (replayState.originalIcon) {
            replayState.replayMarker.setIcon(replayState.originalIcon);
        }
        if (replayState.originalLabel) {
            replayState.replayMarker.setLabel(replayState.originalLabel);
            // Also restore label background if needed
            // Get current vehicle/device data to restore proper status
            if (replayState.markerKey) {
                const isVehicle = !replayState.markerKey.startsWith('gps_');
                let isMoving = false;
                let isOnline = false;
                
                if (isVehicle && replayState.vehicleId) {
                    const vehicle = vehicleData[replayState.vehicleId];
                    if (vehicle) {
                        isMoving = vehicle.isMoving || false;
                        isOnline = vehicle.isOnline || false;
                    }
                } else if (replayState.deviceId) {
                    const device = gpsDevicesData[replayState.deviceId];
                    if (device) {
                        isMoving = device.isMoving || false;
                        isOnline = device.isOnline || false;
                    }
                }
                
                applyLabelBackground(replayState.replayMarker, isMoving, isOnline);
            }
        }
    }
    
    replayState.locations = [];
    replayState.currentIndex = 0;
    replayState.markerKey = null;
    replayState.originalPosition = null;
    replayState.originalIcon = null;
    replayState.originalLabel = null;
    
    if (document.getElementById('replayInfo')) {
        document.getElementById('replayInfo').style.display = 'none';
    }
    if (document.getElementById('replayControls')) {
        document.getElementById('replayControls').style.display = 'none';
    }
    
    if (replayState.replayPolyline) {
        replayState.replayPolyline.setMap(null);
        replayState.replayPolyline = null;
    }
    
    // Hide overlay
    const overlayElement = document.getElementById('replayOverlay');
    if (overlayElement) {
        overlayElement.style.display = 'none';
    }
    
    // Note: We don't remove the marker since it's the existing vehicle marker
    replayState.replayMarker = null;
}

// Update replay position
async function updateReplayPosition() {
    if (replayState.locations.length === 0 || !replayState.replayMarker) return;

    const location = replayState.locations[replayState.currentIndex];
    
    // Safely parse and validate coordinates
    const lat = location.lat !== null && location.lat !== undefined ? parseFloat(location.lat) : null;
    const lng = location.lng !== null && location.lng !== undefined ? parseFloat(location.lng) : null;

    // Validate coordinates
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
        console.warn('Invalid coordinates at index', replayState.currentIndex);
        return;
    }

    // Coordinates are already snapped when loading replay history
    // So we can use them directly - no need to snap again per point
    const position = { lat, lng };

    // Calculate animation duration based on actual time difference and distance
    // Make animation duration match the actual time gap between points for smooth movement
    let duration = 500; // Default duration
    
    if (replayState.currentIndex > 0) {
        // Calculate actual time difference from previous point
        const prevLoc = replayState.locations[replayState.currentIndex - 1];
        const currentTime = new Date(location.timestamp || location.createdAt).getTime();
        const prevTime = new Date(prevLoc.timestamp || prevLoc.createdAt).getTime();
        const timeDiff = currentTime - prevTime;
        
        if (timeDiff > 0 && timeDiff < 600000) { // Valid time difference (0 to 10 minutes)
            // Use actual time difference, adjusted by playback speed
            duration = timeDiff / replayState.playbackSpeed;
        } else {
            // Fallback: calculate based on distance if time diff is invalid
            const currentPos = replayState.replayMarker.getPosition();
            const distance = calculateDistanceMeters(currentPos.lat(), currentPos.lng(), lat, lng);
            
            // Scale duration with distance: longer distances need more time to animate smoothly
            if (distance < 50) {
                duration = 300; // Short distance: quick animation
            } else if (distance < 200) {
                duration = 500; // Medium distance
            } else {
                duration = Math.min(2000, 500 + (distance / 20)); // Longer distance: scale up
            }
            duration = duration / replayState.playbackSpeed;
        }
    }
    
    // Clamp duration to reasonable values (100ms to 3000ms)
    duration = Math.max(100, Math.min(3000, duration));

    // Safely convert speed to number and determine if moving
    const speed = location.speed !== null && location.speed !== undefined ? parseFloat(location.speed) : 0;
    const isMoving = !isNaN(speed) && speed > 0; // Consider moving if speed > 0
    const isOnline = true; // During replay, always consider online
    
    // Update marker icon and label based on movement status
    updateReplayMarkerStatus(replayState.replayMarker, replayState.markerKey, isMoving, isOnline);

    // Calculate or use heading for marker rotation
    let heading = location.heading !== null && location.heading !== undefined ? parseFloat(location.heading) : null;
    
    // If no heading from GPS data, calculate it from movement direction
    if ((heading === null || isNaN(heading)) && replayState.currentIndex > 0) {
        const prevLoc = replayState.locations[replayState.currentIndex - 1];
        const prevLat = parseFloat(prevLoc.lat);
        const prevLng = parseFloat(prevLoc.lng);
        
        if (!isNaN(prevLat) && !isNaN(prevLng) && !isNaN(lat) && !isNaN(lng)) {
            // Calculate bearing from previous position to current position
            heading = calculateBearing(prevLat, prevLng, lat, lng);
        }
    }
    
    // Use animateMarkerPosition for smooth animation
    animateMarkerPosition(replayState.replayMarker, position, replayState.markerKey, duration, heading);

    // Smooth map pan (follow marker)
    map.panTo(position);

    // Update progress
    const progress = ((replayState.currentIndex + 1) / replayState.locations.length) * 100;
    document.getElementById('replayProgress').textContent = `${replayState.currentIndex + 1} / ${replayState.locations.length}`;
    document.getElementById('replayProgressBar').style.width = progress + '%';

    // Update current info
    const timestamp = location.timestamp || location.createdAt;
    document.getElementById('replayCurrentTime').textContent = formatDateFullPH(timestamp);
    document.getElementById('replayCurrentSpeed').textContent = (isNaN(speed) ? 0 : speed).toFixed(2) + ' km/h';
    
    // Use already declared lat and lng variables (they're already validated above)
    document.getElementById('replayCurrentLocation').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// Update marker icon and label status during replay
function updateReplayMarkerStatus(marker, markerKey, isMoving, isOnline) {
    if (!marker || !markerKey) return;

    // Determine if it's a vehicle or GPS device marker
    const isVehicle = !markerKey.startsWith('gps_');
    
    // Get label text
    let labelText = '';
    if (isVehicle) {
        const vehicleId = parseInt(markerKey);
        const vehicle = vehicleData[vehicleId];
        if (vehicle) {
            labelText = vehicle.modelName || vehicle.plateNumber?.substring(0, 8) || 'Vehicle';
        }
    } else {
        const deviceId = markerKey.replace('gps_', '');
        labelText = deviceId.substring(deviceId.length - 4) || 'GPS';
    }

    // Get current icon URL to check if it needs updating
    const currentIconUrl = marker.getIcon()?.url || '';
    const newIconUrl = getMarkerIconUrl(isOnline, isMoving);
    const iconChanged = currentIconUrl !== newIconUrl;

    // Update icon if status changed
    if (iconChanged || !currentIconUrl) {
        // Clear rotation cache when icon changes
        clearMarkerRotationCache(marker);
        
        // Set icon with appropriate size
        const iconSize = isVehicle ? new google.maps.Size(36, 36) : new google.maps.Size(40, 40);
        const labelOrigin = isVehicle ? new google.maps.Point(18, 50) : new google.maps.Point(20, 55);
        
        marker.setIcon({
            url: newIconUrl,
            scaledSize: iconSize,
            labelOrigin: labelOrigin
        });
    }

    // Update label with status-based styling
    const labelClassName = isVehicle 
        ? getLabelClassName('vehicle-marker-label', isMoving, isOnline)
        : getLabelClassName('gps-marker-label', isMoving, isOnline);
    
    marker.setLabel({
        text: labelText,
        color: '#FFFFFF',
        fontSize: isVehicle ? '14px' : '10px',
        fontFamily: 'Arial, sans-serif',
        fontWeight: isVehicle ? 'normal' : 'bold',
        className: labelClassName
    });

    // Apply label background styling
    applyLabelBackground(marker, isMoving, isOnline);
}

// Calculate playback interval based on actual time differences between consecutive points
function calculatePlaybackInterval() {
    if (replayState.locations.length < 2) return 1000; // Default 1 second
    if (replayState.currentIndex >= replayState.locations.length - 1) return 1000;

    // Use the actual time difference between current and next point
    const currentLoc = replayState.locations[replayState.currentIndex];
    const nextLoc = replayState.locations[replayState.currentIndex + 1];
    
    const time1 = new Date(currentLoc.timestamp || currentLoc.createdAt).getTime();
    const time2 = new Date(nextLoc.timestamp || nextLoc.createdAt).getTime();
    const timeDiff = time2 - time1;
    
    // If time difference is valid (positive and reasonable)
    if (timeDiff > 0 && timeDiff < 600000) { // Between 0 and 10 minutes
        // Divide by playback speed to allow faster replay
        const interval = timeDiff / replayState.playbackSpeed;
        // Clamp between 100ms (very fast) and 10000ms (10 seconds max per point)
        return Math.max(100, Math.min(10000, interval));
    }
    
    // Fallback: calculate average time difference from recent points
    let totalTimeDiff = 0;
    let validDiffs = 0;
    const lookbackCount = Math.min(10, replayState.locations.length - 1);
    
    for (let i = Math.max(1, replayState.currentIndex - lookbackCount); i <= replayState.currentIndex && i < replayState.locations.length - 1; i++) {
        const prevTime = new Date(replayState.locations[i - 1].timestamp || replayState.locations[i - 1].createdAt).getTime();
        const currTime = new Date(replayState.locations[i].timestamp || replayState.locations[i].createdAt).getTime();
        const diff = currTime - prevTime;
        
        if (diff > 0 && diff < 600000) { // Valid diff between 0 and 10 minutes
            totalTimeDiff += diff;
            validDiffs++;
        }
    }

    if (validDiffs === 0) return 1000; // Default 1 second

    const avgDiff = totalTimeDiff / validDiffs;
    const baseInterval = avgDiff / replayState.playbackSpeed;

    // Clamp between 100ms and 5000ms for smooth playback
    return Math.max(100, Math.min(5000, baseInterval));
}

// Calculate total duration
function calculateDuration(locations) {
    if (locations.length < 2) return 0;

    const startTime = new Date(locations[0].timestamp || locations[0].createdAt).getTime();
    const endTime = new Date(locations[locations.length - 1].timestamp || locations[locations.length - 1].createdAt).getTime();

    return endTime - startTime;
}

// Format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Calculate total distance
function calculateDistance(locations) {
    if (locations.length < 2) return 0;

    let totalDistance = 0;

    for (let i = 1; i < locations.length; i++) {
        const lat1 = parseFloat(locations[i - 1].lat);
        const lng1 = parseFloat(locations[i - 1].lng);
        const lat2 = parseFloat(locations[i].lat);
        const lng2 = parseFloat(locations[i].lng);

        // Skip invalid coordinates
        if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
            continue;
        }

        totalDistance += haversineDistance(lat1, lng1, lat2, lng2);
    }

    return totalDistance;
}

// Haversine formula to calculate distance between two points
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Export functions globally for onclick handlers
window.showReplayForVehicle = showReplayForVehicle;
window.showReplayForDevice = showReplayForDevice;
window.loadReplayHistory = loadReplayHistory;
window.toggleReplay = toggleReplay;
window.stopReplay = stopReplay;
window.resetReplay = resetReplay;

