// ========================================
// MAP INITIALIZATION - Vehicle Monitoring
// ========================================

import { 
    map, 
    setMap, 
    vehicleData, 
    gpsDevicesData, 
    currentInfoWindow,
    setCurrentInfoWindow,
    setIsFirstMapLoad
} from './state.js';
import { loadVehiclesForMapInit } from './data-loader.js';
import { createMapTypeToggle, createFullscreenButton } from './map-controls.js';
import { createTraceToggleContainer, hideTraceToggleContainer, showTraceToggleContainer } from './trace-toggle.js';
import { updateMarkerLabelColors } from './markers.js';
import { updateVehicleList } from './vehicle-list.js';
import { updateMapMarkers } from './markers.js';
import { updateTraceToggles } from './trace-toggle.js';

// Initialize Google Maps
export async function initMap() {
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
                    mapDiv.style.height = '850px';
                    
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
                    const newMap = new google.maps.Map(mapDiv, {
                        center: mapCenter,
                        zoom: mapZoom,
                        mapTypeId: 'roadmap',
                        fullscreenControl: false, // Disable default - we'll use custom button
                        mapTypeControl: false, // Disable default - we'll use custom toggle
                        streetViewControl: true,
                        zoomControl: true
                    });
                    
                    // Set map in state
                    setMap(newMap);
                    
                    // Create custom map type toggle button (Sinotrack style)
                    createMapTypeToggle();
                    
                    // Create custom fullscreen button
                    createFullscreenButton();
                    
                    // Create trace toggle container (will be populated dynamically)
                    createTraceToggleContainer();
                    
                    // Listen for map type changes to update label colors
                    google.maps.event.addListener(newMap, 'maptypeid_changed', () => {
                        updateMarkerLabelColors();
                    });
                    
                    // Close InfoWindow when clicking on the map
                    google.maps.event.addListener(newMap, 'click', () => {
                        if (currentInfoWindow) {
                            currentInfoWindow.close();
                            setCurrentInfoWindow(null);
                        }
                    });
                    
                    // Hide/show trace toggle when Street View opens/closes
                    const streetView = newMap.getStreetView();
                    if (streetView) {
                        // Listen for Street View visibility changes
                        google.maps.event.addListener(streetView, 'visible_changed', () => {
                            if (streetView.getVisible()) {
                                // Street View is open - hide trace toggle
                                hideTraceToggleContainer();
                            } else {
                                // Street View is closed - show trace toggle
                                showTraceToggleContainer();
                            }
                        });
                    }
                    
                    // Update vehicle list and map with markers (vehicles already loaded)
                    updateVehicleList();
                    updateMapMarkers();
                    updateTraceToggles(); // Update trace toggles for all devices
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
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
            mapDiv.innerHTML = '<div class="alert alert-danger">Error loading map. Please check your Google Maps API key.</div>';
        }
    }
}

