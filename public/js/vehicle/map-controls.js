// ========================================
// MAP CONTROLS - Vehicle Monitoring
// ========================================

import { map, setMap } from './state.js';
import { updateMarkerLabelColors } from './markers.js';

// Create custom map type toggle button (Sinotrack style)
export function createMapTypeToggle() {
    if (!map) return;
    
    // Create toggle container
    const toggleContainer = document.createElement('div');
    toggleContainer.id = 'mapTypeToggle';
    toggleContainer.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        background: white;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        display: flex;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Map button
    const mapButton = document.createElement('button');
    mapButton.id = 'mapTypeMap';
    mapButton.textContent = 'Map';
    mapButton.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        outline: none;
    `;
    
    // Satellite button
    const satelliteButton = document.createElement('button');
    satelliteButton.id = 'mapTypeSatellite';
    satelliteButton.textContent = 'Satellite';
    satelliteButton.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: white;
        color: #6b7280;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        outline: none;
    `;
    
    // Add buttons to container
    toggleContainer.appendChild(mapButton);
    toggleContainer.appendChild(satelliteButton);
    
    // Add to map container
    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.appendChild(toggleContainer);
    }
    
    // Update button styles based on current map type
    function updateToggleState() {
        const currentType = map.getMapTypeId();
        if (currentType === 'roadmap' || currentType === 'terrain') {
            mapButton.style.background = '#3b82f6';
            mapButton.style.color = 'white';
            satelliteButton.style.background = 'white';
            satelliteButton.style.color = '#6b7280';
        } else {
            mapButton.style.background = 'white';
            mapButton.style.color = '#6b7280';
            satelliteButton.style.background = '#3b82f6';
            satelliteButton.style.color = 'white';
        }
    }
    
    // Initial state
    updateToggleState();
    
    // Map button click handler
    mapButton.addEventListener('click', () => {
        map.setMapTypeId('roadmap');
        updateToggleState();
    });
    
    // Satellite button click handler
    satelliteButton.addEventListener('click', () => {
        map.setMapTypeId('satellite');
        updateToggleState();
    });
    
    // Listen for map type changes (in case changed by other means)
    google.maps.event.addListener(map, 'maptypeid_changed', () => {
        updateToggleState();
        updateMarkerLabelColors();
    });
}

// Create custom fullscreen button (positioned below map/satellite toggle)
export function createFullscreenButton() {
    if (!map) return;
    
    // Create fullscreen button container
    const fullscreenButton = document.createElement('button');
    fullscreenButton.id = 'mapFullscreenBtn';
    fullscreenButton.innerHTML = '<i class="fa fa-expand"></i>';
    fullscreenButton.style.cssText = `
        position: absolute;
        top: 58px;
        right: 10px;
        z-index: 1000;
        width: 40px;
        height: 40px;
        border: none;
        background: white;
        color: #6b7280;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        outline: none;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Add hover effect
    fullscreenButton.addEventListener('mouseenter', function() {
        this.style.background = '#f3f4f6';
        this.style.color = '#111827';
        this.style.transform = 'scale(1.05)';
    });
    
    fullscreenButton.addEventListener('mouseleave', function() {
        this.style.background = 'white';
        this.style.color = '#6b7280';
        this.style.transform = 'scale(1)';
    });
    
    // Add to map container
    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.appendChild(fullscreenButton);
    }
    
    // Fullscreen functionality
    function toggleFullscreen() {
        const mapDiv = document.getElementById('map');
        if (!mapDiv) return;
        
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
            // Enter fullscreen
            if (mapDiv.requestFullscreen) {
                mapDiv.requestFullscreen();
            } else if (mapDiv.webkitRequestFullscreen) {
                mapDiv.webkitRequestFullscreen();
            } else if (mapDiv.mozRequestFullScreen) {
                mapDiv.mozRequestFullScreen();
            } else if (mapDiv.msRequestFullscreen) {
                mapDiv.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    
    // Update icon based on fullscreen state
    function updateFullscreenIcon() {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (isFullscreen) {
            fullscreenButton.innerHTML = '<i class="fa fa-compress"></i>';
            fullscreenButton.style.background = '#3b82f6';
            fullscreenButton.style.color = 'white';
        } else {
            fullscreenButton.innerHTML = '<i class="fa fa-expand"></i>';
            fullscreenButton.style.background = 'white';
            fullscreenButton.style.color = '#6b7280';
        }
    }
    
    // Click handler
    fullscreenButton.addEventListener('click', toggleFullscreen);
    
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
    document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
    document.addEventListener('MSFullscreenChange', updateFullscreenIcon);
    
    // Initial state
    updateFullscreenIcon();
}

