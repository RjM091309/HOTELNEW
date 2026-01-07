// ========================================
// MAP CONTROLS - Vehicle Monitoring
// ========================================

import { map, setMap } from './state.js';
import { updateMarkerLabelColors } from './markers.js';
import { toggleRouteSearchContainer } from './route-search.js';

// Create location search box (always visible, aligned with map/satellite toggle)
export function createLocationSearchBox() {
    if (!map) return;
    
    // Create search box container
    const searchBox = document.createElement('div');
    searchBox.id = 'locationSearchBox';
    searchBox.style.cssText = `
        position: absolute;
        top: 10px;
        right: 160px;
        z-index: 1000;
        background: white;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 0;
        width: 300px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.id = 'mapLocationSearchInput';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search for a place...';
    searchInput.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
        background: white;
        color: #111827;
    `;
    
    searchBox.appendChild(searchInput);
    
    // Add to map container
    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.appendChild(searchBox);
    }
    
    // Initialize autocomplete after Google Maps is ready
    setTimeout(() => {
        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            const autocomplete = new google.maps.places.Autocomplete(searchInput, {
                types: ['geocode', 'establishment'],
                componentRestrictions: { country: 'ph' }
            });
            
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (!place.geometry) {
                    return;
                }
                
                // Center map on the selected location
                if (place.geometry.viewport) {
                    map.fitBounds(place.geometry.viewport);
                } else {
                    map.setCenter(place.geometry.location);
                    map.setZoom(15);
                }
                
                console.log('✅ Location searched:', place.name || place.formatted_address);
            });
            
            // Allow Enter key to search
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Trigger place_changed event
                    google.maps.event.trigger(autocomplete, 'place_changed');
                }
            });
        } else {
            console.warn('Google Places API not loaded yet for location search');
        }
    }, 500);
}

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
            // Satellite or hybrid mode
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
    
    // Satellite button click handler - use 'hybrid' to show labels/place names
    satelliteButton.addEventListener('click', () => {
        map.setMapTypeId('hybrid'); // Hybrid shows satellite imagery with labels
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

// Create route search button
export function createRouteSearchButton() {
    if (!map) return;
    
    // Create route search button
    const routeSearchButton = document.createElement('button');
    routeSearchButton.id = 'routeSearchBtn';
    routeSearchButton.innerHTML = '<i class="fa fa-route"></i>';
    routeSearchButton.title = 'Search Location';
    routeSearchButton.style.cssText = `
        position: absolute;
        top: 106px;
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
    routeSearchButton.addEventListener('mouseenter', function() {
        this.style.background = '#f3f4f6';
        this.style.color = '#111827';
        this.style.transform = 'scale(1.05)';
    });
    
    routeSearchButton.addEventListener('mouseleave', function() {
        this.style.background = 'white';
        this.style.color = '#6b7280';
        this.style.transform = 'scale(1)';
    });
    
    // Add to map container
    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.appendChild(routeSearchButton);
    }
    
    // Click handler
    routeSearchButton.addEventListener('click', () => {
        toggleRouteSearchContainer();
    });
}

