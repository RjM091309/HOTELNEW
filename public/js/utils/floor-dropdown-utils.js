// =============================================================================
// FLOOR DROPDOWN UTILITIES
// =============================================================================

// Shared utility for populating floor dropdowns to prevent duplicate API calls

// Global cache for floor data to prevent multiple API calls
let floorDataCache = null;
let floorDataPromise = null;

function populateFloorDropdownGeneric(selector, addPlaceholder = false, placeholderText = 'Select Floor') {
    // Use cached data if available
    if (floorDataCache) {
        populateDropdownFromCache(selector, addPlaceholder, placeholderText);
        return;
    }

    // If request is already in progress, wait for it
    if (floorDataPromise) {
        floorDataPromise.then(() => {
            populateDropdownFromCache(selector, addPlaceholder, placeholderText);
        });
        return;
    }

    // Make API call and cache the result
    floorDataPromise = $.ajax({
        url: '/booking/get_floors_for_dropdown',
        method: 'GET',
        success: function(data) {
            floorDataCache = data;
            populateDropdownFromCache(selector, addPlaceholder, placeholderText);
        },
        error: function(err) {
            console.error('Error fetching floors:', err);
            floorDataPromise = null; // Reset promise on error
        }
    });
}

function populateDropdownFromCache(selector, addPlaceholder, placeholderText) {
    const floorDropdown = $(selector);
    floorDropdown.empty();
    
    if (addPlaceholder) {
        floorDropdown.append(`<option value="" disabled selected>${placeholderText}</option>`);
    }

    (floorDataCache || []).forEach(function(floor) {
        floorDropdown.append(`<option value="${floor.floor_number}">${floor.floor_number} Floor</option>`);
    });
}

// Function to clear cache (useful for refreshing data)
function clearFloorDataCache() {
    floorDataCache = null;
    floorDataPromise = null;
}

// Make functions globally available
window.populateFloorDropdownGeneric = populateFloorDropdownGeneric;
window.clearFloorDataCache = clearFloorDataCache;
