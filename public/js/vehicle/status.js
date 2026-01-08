// ========================================
// STATUS FUNCTIONS - Vehicle Monitoring
// ========================================

// Get marker icon URL based on status (moving, standby, offline)
export function getMarkerIconUrl(isOnline, isMoving) {
    if (!isOnline) {
        return '/img/gpsmarker.png'; // Offline
    }
    if (isMoving) {
        return '/img/gpsmarker-2.png'; // Moving
    }
    return '/img/gpsmarker-1.png'; // Standby (online but not moving)
}

// Get status text and color based on online and moving status
// Colors match marker label colors for consistency
export function getStatusInfo(isOnline, isMoving) {
    if (!isOnline) {
        return {
            text: 'Offline',
            color: '#666666', // Gray - matches marker label offline color
            badgeClass: 'secondary',
            dotColor: '#666666'
        };
    }
    if (isMoving) {
        return {
            text: 'In Transit',
            color: '#00CC00', // Green - matches marker label moving color
            badgeClass: 'success',
            dotColor: '#00CC00'
        };
    }
    return {
        text: 'Standby',
        color: '#0076FF', // Blue - matches marker label standby color
        badgeClass: 'primary',
        dotColor: '#0076FF'
    };
}

