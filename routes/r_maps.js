const express = require('express');
const router = express.Router();
const MapsController = require('../controller/c_maps');

// Get Google Maps API key (for frontend use)
router.get('/api-key', MapsController.getApiKey);

// Geocoding - Convert address to coordinates
router.get('/geocode', MapsController.geocode);

// Reverse Geocoding - Convert coordinates to address
router.get('/reverse-geocode', MapsController.reverseGeocode);

// Places Search - Search for places
router.get('/places/search', MapsController.searchPlaces);

// Places Details - Get details of a specific place
router.get('/places/details', MapsController.getPlaceDetails);

// Directions - Get directions between two points
router.get('/directions', MapsController.getDirections);

// Distance Matrix - Calculate distance and travel time
router.get('/distance-matrix', MapsController.getDistanceMatrix);

// Autocomplete - Place autocomplete suggestions
router.get('/autocomplete', MapsController.autocomplete);

// Snap to Roads - Snap GPS coordinates to nearest roads
router.post('/snap-to-roads', MapsController.snapToRoads);

// ========================================
// ANDROID API ENDPOINTS - MAP SDK (Driver App)
// ========================================
// PUBLIC ROUTES - NO AUTHENTICATION REQUIRED
// These endpoints are for Android driver app (walang login requirement pa)
// Optimized endpoints for Android driver app using map SDK
// Format: simplified JSON for easy parsing in Android

// Get directions/route for driver navigation
// GET /api/maps/android/directions?origin=lat,lng&destination=lat,lng&mode=driving
// Returns: route optimized for Android Map SDK display
// PUBLIC: No login required
router.get('/android/directions', MapsController.getDirectionsForAndroid);

// Search places for driver to find destinations
// GET /api/maps/android/places/search?query=address&location=lat,lng&radius=5000
// PUBLIC: No login required
router.get('/android/places/search', MapsController.searchPlacesForAndroid);

// Get place details (for destination info)
// GET /api/maps/android/places/details?placeId=xxx
// PUBLIC: No login required
router.get('/android/places/details', MapsController.getPlaceDetailsForAndroid);

// Reverse geocode - Get address from coordinates
// GET /api/maps/android/reverse-geocode?lat=xxx&lng=xxx
// PUBLIC: No login required
router.get('/android/reverse-geocode', MapsController.reverseGeocodeForAndroid);

// Geocode - Get coordinates from address
// GET /api/maps/android/geocode?address=xxx
// PUBLIC: No login required
router.get('/android/geocode', MapsController.geocodeForAndroid);

module.exports = router;

