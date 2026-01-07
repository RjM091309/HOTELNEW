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
export function getStatusInfo(isOnline, isMoving) {
    if (!isOnline) {
        return {
            text: 'Offline',
            color: '#f59e0b', // Orange
            badgeClass: 'warning',
            dotColor: '#f59e0b'
        };
    }
    if (isMoving) {
        return {
            text: 'In Transit',
            color: '#10b981', // Green
            badgeClass: 'success',
            dotColor: '#10b981'
        };
    }
    return {
        text: 'Standby',
        color: '#3b82f6', // Blue
        badgeClass: 'primary',
        dotColor: '#3b82f6'
    };
}

