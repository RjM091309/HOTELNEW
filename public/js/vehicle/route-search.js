// ========================================
// ROUTE SEARCH - Vehicle Monitoring
// ========================================

import { map } from './state.js';

let routeSearchContainer = null;
let fromAutocomplete = null;
let toAutocomplete = null;
let directionsService = null;
let directionsRenderer = null;
let routeMarkers = [];
let currentFromLatLng = null;
let routeSummaryEl = null;

// Create route search container
export function createRouteSearchContainer() {
    if (!map) return;
    
    // Check if container already exists
    if (routeSearchContainer) return routeSearchContainer;
    
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    
    // Create container
    routeSearchContainer = document.createElement('div');
    routeSearchContainer.id = 'routeSearchContainer';
    routeSearchContainer.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 16px;
        min-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: none;
    `;
    
    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e5e7eb;
    `;
    
    const title = document.createElement('h6');
    title.textContent = 'Search Location';
    title.style.cssText = 'margin: 0; font-size: 16px; font-weight: 600; color: #111827;';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 24px;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        line-height: 1;
        transition: color 0.2s;
    `;
    closeBtn.onmouseenter = () => closeBtn.style.color = '#111827';
    closeBtn.onmouseleave = () => closeBtn.style.color = '#6b7280';
    closeBtn.onclick = () => {
        hideRouteSearchContainer();
    };
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create form
    const form = document.createElement('form');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    form.onsubmit = (e) => {
        e.preventDefault();
        calculateRoute();
    };
    
    // From field
    const fromGroup = document.createElement('div');
    fromGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
    
    const fromLabel = document.createElement('label');
    fromLabel.textContent = 'From';
    fromLabel.style.cssText = 'font-size: 13px; font-weight: 600; color: #374151;';
    
    const fromInput = document.createElement('input');
    fromInput.id = 'routeFromInput';
    fromInput.type = 'text';
    fromInput.placeholder = 'Enter starting location';
    fromInput.style.cssText = `
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        background: #ffffff;
        color: #111827;
    `;
    fromInput.onfocus = () => fromInput.style.borderColor = '#3b82f6';
    fromInput.onblur = () => fromInput.style.borderColor = '#d1d5db';
    
    // Use my location button
    const useLocationBtn = document.createElement('button');
    useLocationBtn.type = 'button';
    useLocationBtn.textContent = 'Use my location';
    useLocationBtn.style.cssText = `
        align-self: flex-start;
        padding: 6px 10px;
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
    `;
    useLocationBtn.onmouseenter = () => {
        useLocationBtn.style.background = '#e5e7eb';
        useLocationBtn.style.borderColor = '#cbd5e1';
    };
    useLocationBtn.onmouseleave = () => {
        useLocationBtn.style.background = '#f3f4f6';
        useLocationBtn.style.borderColor = '#d1d5db';
    };
    useLocationBtn.onclick = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by this browser.');
            return;
        }
        useLocationBtn.disabled = true;
        useLocationBtn.textContent = 'Getting location...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                currentFromLatLng = new google.maps.LatLng(latitude, longitude);
                fromInput.value = 'My location';
                // Clear any selected place to avoid stale geometry
                if (fromAutocomplete) {
                    fromAutocomplete.set('place', null);
                }
                useLocationBtn.disabled = false;
                useLocationBtn.textContent = 'Use my location';
            },
            (err) => {
                console.error('Geolocation error:', err);
                alert('Unable to get your location. Please allow location access or enter an address.');
                useLocationBtn.disabled = false;
                useLocationBtn.textContent = 'Use my location';
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
    };
    
    fromGroup.appendChild(fromLabel);
    fromGroup.appendChild(fromInput);
    fromGroup.appendChild(useLocationBtn);
    
    // To field
    const toGroup = document.createElement('div');
    toGroup.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    
    const toLabel = document.createElement('label');
    toLabel.textContent = 'To';
    toLabel.style.cssText = 'font-size: 13px; font-weight: 600; color: #374151;';
    
    const toInput = document.createElement('input');
    toInput.id = 'routeToInput';
    toInput.type = 'text';
    toInput.placeholder = 'Enter destination';
    toInput.style.cssText = `
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        background: #ffffff;
        color: #111827;
    `;
    toInput.onfocus = () => toInput.style.borderColor = '#3b82f6';
    toInput.onblur = () => toInput.style.borderColor = '#d1d5db';
    
    toGroup.appendChild(toLabel);
    toGroup.appendChild(toInput);
    
    // Buttons
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = 'display: flex; gap: 8px; margin-top: 4px;';
    
    const searchBtn = document.createElement('button');
    searchBtn.type = 'submit';
    searchBtn.textContent = 'Search';
    searchBtn.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    `;
    searchBtn.onmouseenter = () => searchBtn.style.background = '#2563eb';
    searchBtn.onmouseleave = () => searchBtn.style.background = '#3b82f6';
    
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = `
        padding: 10px 16px;
        background: #f3f4f6;
        color: #374151;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    `;
    clearBtn.onmouseenter = () => clearBtn.style.background = '#e5e7eb';
    clearBtn.onmouseleave = () => clearBtn.style.background = '#f3f4f6';
    clearBtn.onclick = () => {
        clearRoute();
    };
    
    buttonGroup.appendChild(searchBtn);
    buttonGroup.appendChild(clearBtn);
    
    form.appendChild(fromGroup);
    form.appendChild(toGroup);
    form.appendChild(buttonGroup);
    
    // Summary
    routeSummaryEl = document.createElement('div');
    routeSummaryEl.id = 'routeSummary';
    routeSummaryEl.style.cssText = 'margin-top: 10px; font-size: 13px; color: #374151; min-height: 18px;';
    routeSummaryEl.textContent = '';
    
    routeSearchContainer.appendChild(header);
    routeSearchContainer.appendChild(form);
    routeSearchContainer.appendChild(routeSummaryEl);
    
    // Add to map
    mapDiv.appendChild(routeSearchContainer);
    
    // Initialize autocomplete after a short delay to ensure Google Maps is ready
    setTimeout(() => {
        initializeAutocomplete();
    }, 500);
    
    return routeSearchContainer;
}

// Initialize Google Places Autocomplete
function initializeAutocomplete() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        console.warn('Google Places API not loaded yet, retrying...');
        setTimeout(initializeAutocomplete, 500);
        return;
    }
    
    const fromInput = document.getElementById('routeFromInput');
    const toInput = document.getElementById('routeToInput');
    
    if (!fromInput || !toInput) return;
    
    // Create autocomplete for "From" field
    fromAutocomplete = new google.maps.places.Autocomplete(fromInput, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'ph' } // Restrict to Philippines
    });
    
    // Create autocomplete for "To" field
    toAutocomplete = new google.maps.places.Autocomplete(toInput, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'ph' } // Restrict to Philippines
    });
    
    console.log('✅ Route search autocomplete initialized');
}

// Calculate and display route
function calculateRoute() {
    if (!map || !fromAutocomplete || !toAutocomplete) {
        console.error('Route search: Map or autocomplete not initialized');
        return;
    }
    
    const fromPlace = fromAutocomplete.getPlace();
    const toPlace = toAutocomplete.getPlace();
    
    // Determine origin: geolocation if set, else autocomplete
    let originLatLng = null;
    if (currentFromLatLng) {
        originLatLng = currentFromLatLng;
    } else if (fromPlace && fromPlace.geometry) {
        originLatLng = fromPlace.geometry.location;
    } else {
        alert('Please select a valid starting location or use your location.');
        return;
    }
    
    if (!toPlace || !toPlace.geometry) {
        alert('Please select a valid destination');
        return;
    }
    
    // Initialize Directions Service and Renderer if not already done
    if (!directionsService) {
        directionsService = new google.maps.DirectionsService();
    }
    
    if (!directionsRenderer) {
        directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: '#3b82f6',
                strokeWeight: 5,
                strokeOpacity: 0.8
            }
        });
    } else {
        directionsRenderer.setMap(map);
    }
    
    // Clear existing route markers
    clearRouteMarkers();
    
    // Calculate route
    directionsService.route({
        origin: originLatLng,
        destination: toPlace.geometry.location,
        travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(result);
            
            // Compute distance/duration (first route)
            const route = result.routes && result.routes[0];
            if (route && route.legs && route.legs.length) {
                const totalMeters = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
                const totalSeconds = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
                const km = (totalMeters / 1000).toFixed(2);
                const mins = Math.round(totalSeconds / 60);
                if (routeSummaryEl) {
                    routeSummaryEl.textContent = `Distance: ${km} km • Duration: ${mins} min`;
                }
            } else if (routeSummaryEl) {
                routeSummaryEl.textContent = '';
            }
            
            // Add custom markers for start and end
            const startMarker = new google.maps.Marker({
                position: fromPlace.geometry.location,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#10b981',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2
                },
                title: 'Start: ' + fromPlace.formatted_address
            });
            
            const endMarker = new google.maps.Marker({
                position: toPlace.geometry.location,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#ef4444',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2
                },
                title: 'End: ' + toPlace.formatted_address
            });
            
            routeMarkers.push(startMarker, endMarker);
            
            // Fit map to show entire route
            const bounds = new google.maps.LatLngBounds();
            result.routes[0].legs.forEach(leg => {
                bounds.extend(leg.start_location);
                bounds.extend(leg.end_location);
            });
            map.fitBounds(bounds, { padding: 50 });
            
            console.log('✅ Route calculated successfully');
        } else {
            console.error('Route calculation failed:', status);
            if (routeSummaryEl) routeSummaryEl.textContent = '';
            alert('Unable to calculate route. Please check your locations and try again.');
        }
    });
}

// Clear route
function clearRoute() {
    if (directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
        directionsRenderer.setMap(null);
    }
    
    clearRouteMarkers();
    
    const fromInput = document.getElementById('routeFromInput');
    const toInput = document.getElementById('routeToInput');
    
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    currentFromLatLng = null;
    if (routeSummaryEl) routeSummaryEl.textContent = '';
    
    console.log('✅ Route cleared');
}

// Clear route markers
function clearRouteMarkers() {
    routeMarkers.forEach(marker => {
        marker.setMap(null);
    });
    routeMarkers = [];
}

// Show route search container
export function showRouteSearchContainer() {
    if (!routeSearchContainer) {
        createRouteSearchContainer();
    }
    routeSearchContainer.style.display = 'block';
    
    // Update button state
    const routeSearchBtn = document.getElementById('routeSearchBtn');
    if (routeSearchBtn) {
        routeSearchBtn.style.background = '#3b82f6';
        routeSearchBtn.style.color = 'white';
    }
}

// Hide route search container
export function hideRouteSearchContainer() {
    if (routeSearchContainer) {
        routeSearchContainer.style.display = 'none';
        clearRoute();
    }
    
    // Update button state
    const routeSearchBtn = document.getElementById('routeSearchBtn');
    if (routeSearchBtn) {
        routeSearchBtn.style.background = 'white';
        routeSearchBtn.style.color = '#6b7280';
    }
}

// Toggle route search container
export function toggleRouteSearchContainer() {
    if (!routeSearchContainer) {
        showRouteSearchContainer();
    } else if (routeSearchContainer.style.display === 'none' || !routeSearchContainer.style.display) {
        showRouteSearchContainer();
    } else {
        hideRouteSearchContainer();
    }
}

