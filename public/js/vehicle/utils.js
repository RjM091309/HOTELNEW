// ========================================
// UTILITY FUNCTIONS - Vehicle Monitoring
// ========================================

// Format date to Philippines timezone (Asia/Manila, UTC+8)
// Note: The `timestamp` field from GPS device is in UTC
export function formatDatePH(dateInput) {
    if (!dateInput) return 'N/A';
    try {
        let date;
        let dateString = dateInput;
        
        // If it's already a Date object, convert to string first
        if (dateInput instanceof Date) {
            // If it's a Date object, get the UTC components
            const year = dateInput.getUTCFullYear();
            const month = dateInput.getUTCMonth() + 1;
            const day = dateInput.getUTCDate();
            const hours = dateInput.getUTCHours();
            const minutes = dateInput.getUTCMinutes();
            const seconds = dateInput.getUTCSeconds();
            
            // Create UTC date from these components
            date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        }
        // Handle string formats
        else if (typeof dateInput === 'string') {
            // ISO format with Z (UTC): '2026-01-03T00:08:19.000Z' - already UTC, parse directly
            if (dateString.includes('T') && dateString.includes('Z')) {
                date = new Date(dateString);
            }
            // MySQL datetime format: 'YYYY-MM-DD HH:mm:ss' - this is UTC from GPS device
            else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
                // Parse the date components manually and create UTC date
                const [datePart, timePart] = dateString.split(' ');
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes, seconds] = timePart.split(':').map(Number);
                
                // Create UTC date using Date.UTC()
                date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
            }
            // ISO format without timezone: 'YYYY-MM-DDTHH:mm:ss' - treat as UTC
            else if (dateString.includes('T') && !dateString.match(/[+-]\d{2}:\d{2}$/)) {
                date = new Date(dateString + 'Z');
            }
            // ISO format with timezone offset
            else if (dateString.includes('T') && dateString.match(/[+-]\d{2}:\d{2}$/)) {
                date = new Date(dateString);
            }
            // Other string formats - try to parse
            else {
                date = new Date(dateString);
            }
        }
        // Other types - try to convert
        else {
            date = new Date(dateInput);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.error('Invalid date:', dateInput, typeof dateInput);
            return 'N/A';
        }
        
        // Format to Philippines timezone using timeZone option
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        const formatted = formatter.format(date);
        
        return formatted;
    } catch (error) {
        console.error('Error formatting date:', error, dateInput);
        return 'N/A';
    }
}

// Format date to Philippines timezone (full format)
export function formatDateFullPH(dateInput) {
    if (!dateInput) return 'N/A';
    try {
        let date;
        
        // If it's already a Date object, convert to string first
        if (dateInput instanceof Date) {
            // If it's a Date object, get the UTC components
            const year = dateInput.getUTCFullYear();
            const month = dateInput.getUTCMonth() + 1;
            const day = dateInput.getUTCDate();
            const hours = dateInput.getUTCHours();
            const minutes = dateInput.getUTCMinutes();
            const seconds = dateInput.getUTCSeconds();
            
            // Create UTC date from these components
            date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        }
        // Handle string formats
        else if (typeof dateInput === 'string') {
            // MySQL datetime format: 'YYYY-MM-DD HH:mm:ss' - this is UTC from GPS device
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateInput)) {
                // Parse the date components manually and create UTC date
                const [datePart, timePart] = dateInput.split(' ');
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes, seconds] = timePart.split(':').map(Number);
                
                // Create UTC date using Date.UTC()
                date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
            }
            // ISO format: try to parse as UTC
            else if (dateInput.includes('T')) {
                if (dateInput.includes('Z')) {
                    date = new Date(dateInput);
                } else if (!dateInput.match(/[+-]\d{2}:\d{2}$/)) {
                    date = new Date(dateInput + 'Z');
                } else {
                    date = new Date(dateInput);
                }
            }
            // Other string formats
            else {
                date = new Date(dateInput);
            }
        }
        // Other types
        else {
            date = new Date(dateInput);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.error('Invalid date:', dateInput);
            return 'N/A';
        }
        
        // Format to Philippines timezone using timeZone option - include date and time
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        const formatted = formatter.format(date);
        
        return formatted;
    } catch (error) {
        console.error('Error formatting date:', error, dateInput);
        return 'N/A';
    }
}

// Calculate distance in meters between two lat/lng coordinates using Haversine formula
export function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Easing function for smooth animation (ease-out cubic)
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Generate a consistent color for a vehicle/device based on ID
export function getPathColor(id) {
    const colors = [
        '#FF6B6B', // Red
        '#4ECDC4', // Teal
        '#45B7D1', // Blue
        '#FFA07A', // Light Salmon
        '#98D8C8', // Mint
        '#F7DC6F', // Yellow
        '#BB8FCE', // Purple
        '#85C1E2', // Sky Blue
        '#F8B739', // Orange
        '#52BE80', // Green
        '#E74C3C', // Dark Red
        '#3498DB', // Bright Blue
        '#9B59B6', // Dark Purple
        '#1ABC9C', // Turquoise
        '#F39C12', // Dark Orange
    ];
    // Use ID to get consistent color for same vehicle
    const colorIndex = parseInt(id) % colors.length;
    return colors[colorIndex];
}

// Helper function to convert hex to rgb for box-shadow
export function hexToRgb(hex) {
    if (hex === 'transparent') return '0, 0, 0';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
        '0, 0, 0';
}

// Fetch address from coordinates using reverse geocoding
export async function getAddressFromCoordinates(lat, lng) {
    try {
        const response = await fetch(`/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`);
        const data = await response.json();
        if (data.success && data.data && data.data.address) {
            return data.data.address;
        }
        return null;
    } catch (error) {
        console.error('Error fetching address:', error);
        return null;
    }
}

