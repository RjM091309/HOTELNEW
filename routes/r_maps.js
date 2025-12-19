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

module.exports = router;

