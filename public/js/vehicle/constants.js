// ========================================
// CONSTANTS - Vehicle Monitoring
// ========================================
// Centralized constants to avoid magic numbers throughout the codebase

// Socket.IO & Polling
export const DEBOUNCE_DELAY_MS = 150; // Debounce delay for socket updates
export const POLLING_INTERVAL_MS = 10000; // Polling interval when socket is unavailable (10 seconds)
export const PERIODIC_REFRESH_INTERVAL_MS = 15000; // Periodic refresh interval (15 seconds)
export const SOCKET_RETRY_DELAY_MS = 1000; // Socket retry delay
export const SOCKET_INIT_DELAY_MS = 500; // Socket initialization delay
export const SOCKET_FALLBACK_DELAY_MS = 2000; // Socket fallback delay

// Movement & Distance Thresholds
export const MOVEMENT_DISTANCE_METERS = 30; // Minimum distance for movement detection (meters)
export const MOVEMENT_MIN_SPEED_KPH = 3; // Minimum speed for movement (km/h)
export const MOVEMENT_THRESHOLD_METERS = 1; // Distance threshold for smooth marker movement (meters)
export const PATH_POINT_DISTANCE_METERS = 5; // Minimum distance to add point to path (meters)
export const TRACE_FOLLOW_DISTANCE_METERS = 30; // Distance threshold for trace following (meters)

// Animation & Timing
export const DEFAULT_ANIMATION_DURATION_MS = 2000; // Default animation duration (2 seconds)
export const MIN_ANIMATION_DURATION_MS = 800; // Minimum animation duration (0.8 seconds)
export const MAX_ANIMATION_DURATION_MS = 3000; // Maximum animation duration (3 seconds)
export const ANIMATION_DISTANCE_FACTOR = 50; // Distance factor for animation calculation (50m = 1s)
export const MARKER_ROTATION_RETRY_DELAY_MS = 100; // Retry delay for marker rotation
export const MARKER_ROTATION_RETRY_DELAY_LONG_MS = 200; // Long retry delay for marker rotation
export const MARKER_ICON_UPDATE_DELAY_MS = 150; // Delay after icon update for DOM to be ready
export const MARKER_LABEL_UPDATE_DELAY_MS = 100; // Delay for marker label updates

// Battery & Charging
export const BATTERY_STALE_THRESHOLD_MS = 5 * 60 * 1000; // Battery stale threshold (5 minutes)
export const BATTERY_LOW_THRESHOLD = 20; // Low battery threshold (%)
export const BATTERY_MID_THRESHOLD = 50; // Mid battery threshold (%)
export const BATTERY_HIGH_THRESHOLD = 80; // High battery threshold (%)

// Marker Sizes & Dimensions
export const VEHICLE_MARKER_SIZE = 36; // Vehicle marker size (pixels)
export const GPS_MARKER_SIZE = 40; // GPS device marker size (pixels)
export const VEHICLE_LABEL_ORIGIN_X = 18; // Vehicle label origin X
export const VEHICLE_LABEL_ORIGIN_Y = 50; // Vehicle label origin Y
export const GPS_LABEL_ORIGIN_X = 20; // GPS label origin X
export const GPS_LABEL_ORIGIN_Y = 55; // GPS label origin Y
export const MARKER_ICON_MIN_SIZE = 100; // Minimum marker icon size for detection (pixels)

// Path & Polyline
export const MAX_PATH_POINTS = 1000; // Maximum points in vehicle path
export const PATH_STROKE_OPACITY = 0.8; // Path stroke opacity
export const PATH_STROKE_WEIGHT = 3; // Path stroke weight
export const PATH_Z_INDEX = 1; // Path z-index (below markers)

// Map Settings
export const DEFAULT_MAP_ZOOM = 9; // Default map zoom level
export const MAX_MAP_ZOOM = 15; // Maximum map zoom level
export const MAP_BOUNDS_PADDING = 120; // Map bounds padding (pixels)
export const MAP_CENTER_LAT = 14.5995; // Default map center latitude (Manila)
export const MAP_CENTER_LNG = 120.9842; // Default map center longitude (Manila)

// Coordinate Precision
export const COORDINATE_PRECISION = 6; // Coordinate rounding precision (6 decimal places = ~0.1m)
export const COORDINATE_MULTIPLIER = 1000000; // Multiplier for coordinate rounding

// Rotation & Heading
export const HEADING_TOLERANCE_DEGREES = 0.1; // Heading change tolerance (degrees)
export const HEADING_SMOOTH_THRESHOLD_DEGREES = 1; // Heading smoothing threshold (degrees)
export const HEADING_SMOOTHING_FACTOR = 0.2; // Heading smoothing factor (20% per frame)

// Address Caching
export const ADDRESS_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // Address cache expiry (24 hours)
export const ADDRESS_COORDINATE_PRECISION = 4; // Address coordinate precision (4 decimal places = ~11m)
export const ADDRESS_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Address cache cleanup interval (1 hour)

// UI Delays
export const BOUNCE_ANIMATION_DURATION_MS = 2000; // Bounce animation duration (2 seconds)
export const TRACE_PAN_DELAY_MS = 300; // Trace pan delay (milliseconds)
export const INFO_WINDOW_ADDRESS_DELAY_MS = 100; // InfoWindow address fetch delay

// Error Logging Levels
export const LOG_LEVEL = {
    ERROR: 'error',   // Critical errors
    WARN: 'warn',     // Recoverable issues
    DEBUG: 'debug',   // Development info
    INFO: 'info'      // General information
};
