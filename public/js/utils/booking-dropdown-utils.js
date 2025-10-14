// =============================================================================
// BOOKING DROPDOWN UTILITIES
// =============================================================================

// Shared utilities for booking-related dropdowns to prevent duplicate API calls

// Global caches for booking data to prevent multiple API calls
let guestTypesCache = null;
let guestLevelsCache = null;
let breakfastPricesCache = null;
let pickDropCache = null;

// Promises for ongoing requests
let guestTypesPromise = null;
let guestLevelsPromise = null;
let breakfastPricesPromise = null;
let pickDropPromise = null;

// =============================================================================
// GUEST TYPES UTILITY
// =============================================================================

function populateGuestTypesDropdown(selector, addPlaceholder = false, placeholderText = 'Select Guest Type', defaultSelectedId = 1) {
    // Use cached data if available
    if (guestTypesCache) {
        populateGuestTypesFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId);
        return;
    }

    // If request is already in progress, wait for it
    if (guestTypesPromise) {
        guestTypesPromise.then(() => {
            populateGuestTypesFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId);
        });
        return;
    }

    // Make API call and cache the result
    guestTypesPromise = $.ajax({
        url: '/booking/get_guest_types',
        method: 'GET',
        success: function(data) {
            guestTypesCache = data;
            populateGuestTypesFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId);
        },
        error: function(err) {
            console.error('Error fetching guest types:', err);
            guestTypesPromise = null; // Reset promise on error
        }
    });
}

function populateGuestTypesFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId) {
    const dropdown = $(selector);
    dropdown.empty();
    
    if (addPlaceholder) {
        dropdown.append(`<option value="" disabled selected>${placeholderText}</option>`);
    }

    (guestTypesCache || []).forEach(function(item) {
        const isSelected = item.IDNo == defaultSelectedId ? ' selected' : '';
        dropdown.append(`<option value="${item.IDNo}"${isSelected}>${item.TYPE}</option>`);
    });
}

// =============================================================================
// GUEST LEVELS UTILITY
// =============================================================================

function populateGuestLevelsDropdown(selector, addPlaceholder = false, placeholderText = 'Select Guest Level', defaultSelectedId = 9) {
    // Use cached data if available
    if (guestLevelsCache) {
        populateGuestLevelsFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId);
        return;
    }

    // If request is already in progress, wait for it
    if (guestLevelsPromise) {
        guestLevelsPromise.then(() => {
            populateGuestLevelsFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId);
        });
        return;
    }

    // Make API call and cache the result
    guestLevelsPromise = $.ajax({
        url: '/booking/get_guest_level',
        method: 'GET',
        success: function(data) {
            guestLevelsCache = data;
            populateGuestLevelsFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId);
        },
        error: function(err) {
            console.error('Error fetching guest levels:', err);
            guestLevelsPromise = null; // Reset promise on error
        }
    });
}

function populateGuestLevelsFromCache(selector, addPlaceholder, placeholderText, defaultSelectedId) {
    const dropdown = $(selector);
    dropdown.empty();
    
    if (addPlaceholder) {
        dropdown.append(`<option value="" disabled selected>${placeholderText}</option>`);
    }

    (guestLevelsCache || []).forEach(function(item) {
        const isSelected = item.IDNo == defaultSelectedId ? ' selected' : '';
        dropdown.append(`<option value="${item.IDNo}"${isSelected}>${item.TYPE}</option>`);
    });
}

// =============================================================================
// BREAKFAST PRICES UTILITY
// =============================================================================

function getBreakfastPrices() {
    // Use cached data if available
    if (breakfastPricesCache) {
        return Promise.resolve(breakfastPricesCache);
    }

    // If request is already in progress, wait for it
    if (breakfastPricesPromise) {
        return breakfastPricesPromise;
    }

    // Make API call and cache the result
    breakfastPricesPromise = fetch('/booking/get-breakfast-prices')
        .then(res => res.json())
        .then(data => {
            breakfastPricesCache = data;
            return data;
        })
        .catch(err => {
            console.error('Error fetching breakfast prices:', err);
            breakfastPricesPromise = null; // Reset promise on error
            throw err;
        });

    return breakfastPricesPromise;
}

// =============================================================================
// PICK & DROP UTILITY
// =============================================================================

function getPickDropPrices() {
    // Use cached data if available
    if (pickDropCache) {
        return Promise.resolve(pickDropCache);
    }

    // If request is already in progress, wait for it
    if (pickDropPromise) {
        return pickDropPromise;
    }

    // Make API call and cache the result
    pickDropPromise = fetch('/booking/get-pick-drop')
        .then(res => res.json())
        .then(data => {
            pickDropCache = data;
            return data;
        })
        .catch(err => {
            console.error('Error fetching pick & drop prices:', err);
            pickDropPromise = null; // Reset promise on error
            throw err;
        });

    return pickDropPromise;
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

// Function to clear all caches (useful for refreshing data)
function clearBookingDataCache() {
    guestTypesCache = null;
    guestLevelsCache = null;
    breakfastPricesCache = null;
    pickDropCache = null;
    
    guestTypesPromise = null;
    guestLevelsPromise = null;
    breakfastPricesPromise = null;
    pickDropPromise = null;
}

// Make functions globally available
window.populateGuestTypesDropdown = populateGuestTypesDropdown;
window.populateGuestLevelsDropdown = populateGuestLevelsDropdown;
window.getBreakfastPrices = getBreakfastPrices;
window.getPickDropPrices = getPickDropPrices;
window.clearBookingDataCache = clearBookingDataCache;
