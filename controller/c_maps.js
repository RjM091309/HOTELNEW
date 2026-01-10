const axios = require('axios');

class MapsController {
    /**
     * Get Google Maps API Key
     * GET /api/maps/api-key
     */
    getApiKey(req, res) {
        try {
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
            
            if (!apiKey) {
                console.warn('Google Maps API key is not configured. Set VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY in environment variables.');
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured. Please set VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY in your environment variables.',
                    apiKey: null
                });
            }

            // Return in multiple formats for compatibility
            res.status(200).json({
                success: true,
                apiKey: apiKey, // Root level for easier access
                key: apiKey, // Alternative key name
                data: {
                    apiKey: apiKey,
                    key: apiKey
                },
                message: 'API key retrieved successfully'
            });
        } catch (error) {
            console.error('Error getting API key:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve API key',
                error: error.message,
                apiKey: null
            });
        }
    }

    /**
     * Geocoding - Convert address to coordinates
     * GET /api/maps/geocode?address=...
     */
    async geocode(req, res) {
        try {
            const { address } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!address) {
                return res.status(400).json({
                    success: false,
                    message: 'Address parameter is required'
                });
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: address,
                    key: apiKey
                }
            });

            if (response.data.status === 'OK' && response.data.results.length > 0) {
                const result = response.data.results[0];
                res.status(200).json({
                    success: true,
                    data: {
                        address: result.formatted_address,
                        location: {
                            lat: result.geometry.location.lat,
                            lng: result.geometry.location.lng
                        },
                        placeId: result.place_id,
                        types: result.types,
                        fullResult: result
                    },
                    message: 'Geocoding successful'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Address not found',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to geocode address',
                error: error.message
            });
        }
    }

    /**
     * Reverse Geocoding - Convert coordinates to address
     * GET /api/maps/reverse-geocode?lat=...&lng=...
     */
    async reverseGeocode(req, res) {
        try {
            const { lat, lng } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!lat || !lng) {
                return res.status(400).json({
                    success: false,
                    message: 'Latitude and longitude parameters are required'
                });
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    latlng: `${lat},${lng}`,
                    key: apiKey
                }
            });

            if (response.data.status === 'OK' && response.data.results.length > 0) {
                const result = response.data.results[0];
                res.status(200).json({
                    success: true,
                    data: {
                        address: result.formatted_address,
                        location: {
                            lat: parseFloat(lat),
                            lng: parseFloat(lng)
                        },
                        placeId: result.place_id,
                        types: result.types,
                        components: result.address_components,
                        fullResult: result
                    },
                    message: 'Reverse geocoding successful'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Location not found',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reverse geocode coordinates',
                error: error.message
            });
        }
    }

    /**
     * Places Search - Search for places
     * GET /api/maps/places/search?query=...&location=lat,lng&radius=...
     */
    async searchPlaces(req, res) {
        try {
            const { query, location, radius = 5000, type } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!query) {
                return res.status(400).json({
                    success: false,
                    message: 'Query parameter is required'
                });
            }

            const params = {
                query: query,
                key: apiKey
            };

            if (location) {
                params.location = location;
                params.radius = radius;
            }

            if (type) {
                params.type = type;
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
                params: params
            });

            if (response.data.status === 'OK') {
                const places = response.data.results.map(place => ({
                    placeId: place.place_id,
                    name: place.name,
                    address: place.formatted_address,
                    location: {
                        lat: place.geometry.location.lat,
                        lng: place.geometry.location.lng
                    },
                    rating: place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    types: place.types,
                    photos: place.photos
                }));

                res.status(200).json({
                    success: true,
                    data: {
                        places: places,
                        total: places.length
                    },
                    message: 'Places search successful'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'No places found',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Places search error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search places',
                error: error.message
            });
        }
    }

    /**
     * Place Details - Get details of a specific place
     * GET /api/maps/places/details?placeId=...
     */
    async getPlaceDetails(req, res) {
        try {
            const { placeId } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!placeId) {
                return res.status(400).json({
                    success: false,
                    message: 'Place ID parameter is required'
                });
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
                params: {
                    place_id: placeId,
                    fields: 'name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,opening_hours,photos,types,website,url',
                    key: apiKey
                }
            });

            if (response.data.status === 'OK') {
                const place = response.data.result;
                res.status(200).json({
                    success: true,
                    data: {
                        placeId: place.place_id,
                        name: place.name,
                        address: place.formatted_address,
                        location: {
                            lat: place.geometry.location.lat,
                            lng: place.geometry.location.lng
                        },
                        rating: place.rating,
                        userRatingsTotal: place.user_ratings_total,
                        phoneNumber: place.formatted_phone_number,
                        openingHours: place.opening_hours,
                        photos: place.photos,
                        types: place.types,
                        website: place.website,
                        url: place.url
                    },
                    message: 'Place details retrieved successfully'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Place not found',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Place details error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get place details',
                error: error.message
            });
        }
    }

    /**
     * Directions - Get directions between two points
     * GET /api/maps/directions?origin=...&destination=...&mode=...
     */
    async getDirections(req, res) {
        try {
            const { origin, destination, mode = 'driving', waypoints, alternatives = false } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!origin || !destination) {
                return res.status(400).json({
                    success: false,
                    message: 'Origin and destination parameters are required'
                });
            }

            const params = {
                origin: origin,
                destination: destination,
                mode: mode, // driving, walking, bicycling, transit
                key: apiKey
            };

            if (waypoints) {
                params.waypoints = waypoints;
            }

            if (alternatives === 'true') {
                params.alternatives = true;
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
                params: params
            });

            if (response.data.status === 'OK') {
                const routes = response.data.routes.map(route => ({
                    summary: route.summary,
                    distance: route.legs.reduce((sum, leg) => sum + leg.distance.value, 0),
                    distanceText: route.legs[0].distance.text,
                    duration: route.legs.reduce((sum, leg) => sum + leg.duration.value, 0),
                    durationText: route.legs[0].duration.text,
                    steps: route.legs.flatMap(leg => leg.steps.map(step => ({
                        instruction: step.html_instructions,
                        distance: step.distance.text,
                        duration: step.duration.text,
                        polyline: step.polyline.points
                    }))),
                    overviewPolyline: route.overview_polyline.points
                }));

                res.status(200).json({
                    success: true,
                    data: {
                        routes: routes,
                        total: routes.length
                    },
                    message: 'Directions retrieved successfully'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Directions not found',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Directions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get directions',
                error: error.message
            });
        }
    }

    /**
     * Distance Matrix - Calculate distance and travel time
     * GET /api/maps/distance-matrix?origins=...&destinations=...&mode=...
     */
    async getDistanceMatrix(req, res) {
        try {
            const { origins, destinations, mode = 'driving' } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!origins || !destinations) {
                return res.status(400).json({
                    success: false,
                    message: 'Origins and destinations parameters are required'
                });
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
                params: {
                    origins: origins,
                    destinations: destinations,
                    mode: mode,
                    key: apiKey
                }
            });

            if (response.data.status === 'OK') {
                const rows = response.data.rows.map((row, index) => ({
                    origin: response.data.origin_addresses[index],
                    elements: row.elements.map((element, destIndex) => ({
                        destination: response.data.destination_addresses[destIndex],
                        distance: element.distance ? {
                            value: element.distance.value,
                            text: element.distance.text
                        } : null,
                        duration: element.duration ? {
                            value: element.duration.value,
                            text: element.duration.text
                        } : null,
                        status: element.status
                    }))
                }));

                res.status(200).json({
                    success: true,
                    data: {
                        rows: rows
                    },
                    message: 'Distance matrix calculated successfully'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Distance matrix calculation failed',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Distance matrix error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate distance matrix',
                error: error.message
            });
        }
    }

    /**
     * Autocomplete - Place autocomplete suggestions
     * GET /api/maps/autocomplete?input=...&location=lat,lng&radius=...
     */
    async autocomplete(req, res) {
        try {
            const { input, location, radius = 5000, types } = req.query;
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            if (!input) {
                return res.status(400).json({
                    success: false,
                    message: 'Input parameter is required'
                });
            }

            const params = {
                input: input,
                key: apiKey
            };

            if (location) {
                params.location = location;
                params.radius = radius;
            }

            if (types) {
                params.types = types;
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
                params: params
            });

            if (response.data.status === 'OK') {
                const predictions = response.data.predictions.map(prediction => ({
                    placeId: prediction.place_id,
                    description: prediction.description,
                    mainText: prediction.structured_formatting?.main_text,
                    secondaryText: prediction.structured_formatting?.secondary_text,
                    types: prediction.types
                }));

                res.status(200).json({
                    success: true,
                    data: {
                        predictions: predictions,
                        total: predictions.length
                    },
                    message: 'Autocomplete suggestions retrieved successfully'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'No autocomplete suggestions found',
                    status: response.data.status
                });
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get autocomplete suggestions',
                error: error.message
            });
        }
    }

    /**
     * Snap to Roads - Snap GPS coordinates to nearest roads
     * POST /api/maps/snap-to-roads
     * Body: { points: [{lat, lng}, ...] } or { lat, lng } for single point
     */
    async snapToRoads(req, res) {
        try {
            const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    success: false,
                    message: 'Google Maps API key is not configured'
                });
            }

            let points = [];
            
            // Handle both single point and array of points
            if (req.body.points && Array.isArray(req.body.points)) {
                points = req.body.points;
            } else if (req.body.lat && req.body.lng) {
                // Single point
                points = [{ lat: req.body.lat, lng: req.body.lng }];
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request. Provide either {points: [{lat, lng}, ...]} or {lat, lng}'
                });
            }

            if (points.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'At least one point is required'
                });
            }

            // Google Roads API allows up to 100 points per request
            if (points.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Maximum 100 points allowed per request'
                });
            }

            // Format points as "lat,lng|lat,lng|..."
            const path = points.map(p => `${p.lat},${p.lng}`).join('|');

            const response = await axios.get('https://roads.googleapis.com/v1/snapToRoads', {
                params: {
                    path: path,
                    interpolate: true, // Interpolate points to include all points in the path
                    key: apiKey
                }
            });

            if (response.data && response.data.snappedPoints) {
                const snappedPoints = response.data.snappedPoints.map(point => ({
                    location: {
                        latitude: point.location.latitude,
                        longitude: point.location.longitude
                    },
                    originalIndex: point.originalIndex,
                    placeId: point.placeId
                }));

                res.status(200).json({
                    success: true,
                    data: {
                        snappedPoints: snappedPoints,
                        total: snappedPoints.length
                    },
                    message: 'Coordinates snapped to roads successfully'
                });
            } else {
                // No roads found - return original points
                res.status(200).json({
                    success: true,
                    data: {
                        snappedPoints: points.map((p, index) => ({
                            location: {
                                latitude: p.lat,
                                longitude: p.lng
                            },
                            originalIndex: index,
                            placeId: null
                        })),
                        total: points.length
                    },
                    message: 'No roads found, returning original coordinates'
                });
            }
        } catch (error) {
            console.error('Snap to roads error:', error);
            
            // If API error, return original points as fallback
            let points = [];
            if (req.body.points && Array.isArray(req.body.points)) {
                points = req.body.points;
            } else if (req.body.lat && req.body.lng) {
                points = [{ lat: req.body.lat, lng: req.body.lng }];
            }

            res.status(200).json({
                success: true,
                data: {
                    snappedPoints: points.map((p, index) => ({
                        location: {
                            latitude: p.lat,
                            longitude: p.lng
                        },
                        originalIndex: index,
                        placeId: null
                    })),
                    total: points.length
                },
                message: 'Snap to roads failed, returning original coordinates',
                warning: error.response?.data?.error?.message || error.message
            });
        }
    }
}

module.exports = new MapsController();

