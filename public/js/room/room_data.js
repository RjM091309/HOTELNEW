// ========================================
// ROOM MANAGEMENT - MAIN JAVASCRIPT
// ========================================

var dataTable;

// ========================================
// STATUS BADGE FUNCTIONS
// ========================================

// Get label class based on room status (matching payment status design)
// Room Status: the dropdown shows a name (Available / Occupied / Out of order / Cleaning) but the database keeps 1 / 2 / 3 / 4.
// The form used to send the NAME as it was written in the field, which the database does not accept (the room ended with an empty status
// and "UNKNOWN" in the table). These two turn a name into its number and back.
const ROOM_STATUS_NAMES = { '1': 'Available', '2': 'Occupied', '3': 'Out of order', '4': 'Cleaning' };
function roomStatusValue(selector) {
    const raw = String($(selector).val() || '').trim();
    if (/^[1-4]$/.test(raw)) return raw;
    const byName = { 'available': '1', 'occupied': '2', 'out of order': '3', 'maintenance': '3', 'cleaning': '4' };
    return byName[raw.toLowerCase()] || $(selector).attr('data-value') || raw;
}

function getRoomStatusLabel(status) {
    const statusMap = {
        '1': 'label-success',    // Available
        '2': 'label-danger',     // Occupied
        '3': 'label-info',       // Out of order
        '4': 'label-warning'     // Cleaning
    };
    return statusMap[status] || 'label-default';
}

// ========================================
// INITIALIZATION
// ========================================

$(document).ready(function() {
    initializeDataTable();
    setupButtonHandlers();
    setupFormHandlers();
    setupModalHandlers();
    
    // Setup dropdown handlers on document ready
    setupDropdownClickHandlers();
});

// ========================================
// EVENT HANDLERS SETUP
// ========================================

function setupFormHandlers() {
    $('#addRoomForm').on('submit', function(e) {
        e.preventDefault();
        createRoom();
    });
    
    $('#editRoomForm').on('submit', function(e) {
        e.preventDefault();
        updateRoom();
    });
}

function setupModalHandlers() {
    // Modal close handlers
    $(document).on('click', '.modal .close, .modal .btn-secondary', function() {
        $(this).closest('.modal').modal('hide');
    });
    
    // Remove the click outside handler to respect data-bs-backdrop="static"
    // $(document).on('click', '.modal', function(e) {
    //     if (e.target === this) {
    //         $(this).modal('hide');
    //     }
    // });
    
    // Remove the ESC key handler to respect data-keyboard="false"
    // $(document).on('keydown', function(e) {
    //     if (e.key === 'Escape') {
    //         $('.modal.show').modal('hide');
    //     }
    // });
    
    // Modal cleanup
    $('#addRoomModal').on('hidden.bs.modal', function() {
        $('#addRoomForm')[0].reset();
        $(this).find('.is-invalid').removeClass('is-invalid');
        $(this).find('.invalid-feedback').remove();
        $('#addSeasonalPricingSection').hide();
        $('#addNoBedCountMessage').show();
        $('#addPricingTableBody').empty();
    });
    
    $('#editRoomModal').on('hidden.bs.modal', function() {
        $('#editRoomForm')[0].reset();
        $(this).find('.is-invalid').removeClass('is-invalid');
        $(this).find('.invalid-feedback').remove();
        $('#editSeasonalPricingSection').hide();
        $('#editNoBedCountMessage').show();
        $('#editPricingTableBody').empty();
    });
    
    // Initialize MDL components when edit modal is shown
    $('#editRoomModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            
            // Force floating labels for all textfields with values
            const textfields = document.querySelectorAll('#editRoomModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                const input = textfield.querySelector('.mdl-textfield__input');
                if (input && input.value) {
                    textfield.classList.add('is-dirty');
                    // Remove is-focused to prevent green underline by default
                    textfield.classList.remove('is-focused');
                }
            });
            
            // Setup dropdown click handlers
            setupDropdownClickHandlers();
        }, 300);
    });
    

    
    // Add Room button handler
    $(document).on('click', '#addRoomBtn', function() {
        $('#addRoomModal').modal('show');
        loadRoomTypes('add');
        loadAmenities('add');
        $('#addSeasonalPricingSection').hide();
        
        // Initialize MDL components when add modal is shown
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            
            // Setup dropdown click handlers
            setupDropdownClickHandlers();
        }, 300);
    });
    

    

}

function setupButtonHandlers() {
    $(document).on('click', '#manageRoomTypesBtn', function() {
        $('#roomTypesManagementModal').modal('show');
        $('#roomTypesManagementModal').on('shown.bs.modal', function() {
            if (typeof initializeRoomTypeDataTable === 'function') {
                initializeRoomTypeDataTable();
            }
        });
    });
    
    $(document).on('click', '#manageAmenitiesBtn', function() {
        $('#amenitiesManagementModal').modal('show');
        $('#amenitiesManagementModal').on('shown.bs.modal', function() {
            if (typeof initializeAmenityDataTable === 'function') {
                initializeAmenityDataTable();
            }
        });
    });
    
    $(document).on('click', '#manageSeasonsBtn', function() {
        $('#seasonsManagementModal').modal('show');
        $('#seasonsManagementModal').on('shown.bs.modal', function() {
            if (typeof initializeSeasonDataTable === 'function') {
                initializeSeasonDataTable();
            }
        });
    });
}

// ========================================
// SEASONAL PRICING FUNCTIONS
// ========================================

function loadSeasonalPricing() {
    $.ajax({
        url: '/room/seasons',
        method: 'GET',
        success: function(seasons) {
            generateAddPricingTable(seasons);
        },
        error: function() {
            console.error('Failed to load seasons');
        }
    });
}

function loadEditSeasonalPricing(existingPricing = []) {
    $.ajax({
        url: '/room/seasons',
        method: 'GET',
        success: function(seasons) {
            generateEditPricingTable(seasons, existingPricing);
        },
        error: function() {
            console.error('Failed to load seasons');
        }
    });
}

function generateAddPricingTable(seasons) {
    const tbody = document.getElementById('addPricingTableBody');
    tbody.innerHTML = '';

    const bookingTypes = ['walk-in', 'agency'];
    const bedCount = parseInt($('#addRoomBed').val()) || 1;
    
    if (bedCount < 1) return;
    
    const bedCounts = [bedCount];

    seasons.forEach(season => {
        bookingTypes.forEach(type => {
            bedCounts.forEach(bed => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <input type="hidden" name="season_id[]" value="${season.IDNo}">
                        ${season.NAME}
                    </td>
                    <td>
                        <input type="hidden" name="booking_type[]" value="${type}">
                        ${type}
                    </td>
                    <td>
                        <input type="hidden" name="room_bed[]" value="${bed}">
                        ${bed} bed
                    </td>
                    <td>
                        <input type="number" class="mdl-textfield__input" name="season_price[]" value="" step="0.01" style="background-color: #2a3135 ; color: #ffffff; border: 1px solid #2a3135; border-radius: 4px; padding: 8px 12px; width: 100%;">
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    });
}

function generateEditPricingTable(seasons, existingPricing = []) {
    const tbody = document.getElementById('editPricingTableBody');
    tbody.innerHTML = '';

    const bookingTypes = ['walk-in', 'agency'];
    const bedCount = parseInt($('#editRoomBed').val()) || 1;
    
    if (bedCount < 1) return;
    
    const bedCounts = [bedCount];

    seasons.forEach(season => {
        bookingTypes.forEach(type => {
            bedCounts.forEach(bed => {
                // Find existing price for this combination
                const existingPrice = existingPricing.find(p => 
                    p.SEASON_ID == season.IDNo && 
                    p.BOOKING_TYPE === type && 
                    p.ROOM_BED == bed
                );
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <input type="hidden" name="season_id[]" value="${season.IDNo}">
                        ${season.NAME}
                    </td>
                    <td>
                        <input type="hidden" name="booking_type[]" value="${type}">
                        ${type}
                    </td>
                    <td>
                        <input type="hidden" name="room_bed[]" value="${bed}">
                        ${bed} bed
                    </td>
                    <td>
                        <input type="number" class="mdl-textfield__input" name="season_price[]" value="${existingPrice ? existingPrice.PRICE : ''}" step="0.01" style="background-color: #2a3135; color: #ffffff; border: 1px solid #2a3135; border-radius: 4px; padding: 8px 12px; width: 100%;">
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    });
}



// ========================================
// DATATABLE CONFIGURATION
// ========================================

var roomGridData = [];

function initializeDataTable() {
    $('#roomGridSearch').off('input').on('input', renderRoomGrid);
    reloadData();
}

function escRoom(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

// Rooms grouped by floor, as cards (like the calendar's Room View)
function renderRoomGrid() {
    var q = String($('#roomGridSearch').val() || '').trim().toLowerCase();
    var names = { '1': 'Available', '2': 'Occupied', '3': 'Out of order', '4': 'Cleaning' };
    var rooms = roomGridData.filter(function (r) {
        if (!q) return true;
        return [r.ROOM_NUMBER, r.ROOM_TYPE_NAME, names[String(r.ROOM_STATUS)], r.ROOM_DESCRIPTION].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var floors = {};
    rooms.forEach(function (r) {
        var n = parseInt(String(r.ROOM_NUMBER), 10);
        var f = (r.ROOM_FLOOR != null && r.ROOM_FLOOR !== '') ? r.ROOM_FLOOR : (n >= 100 ? Math.floor(n / 100) : 0);
        (floors[f] = floors[f] || []).push(r);
    });
    var html = Object.keys(floors).sort(function (a, b) { return a - b; }).map(function (f) {
        var list = floors[f].sort(function (a, b) { return String(a.ROOM_NUMBER).localeCompare(String(b.ROOM_NUMBER), undefined, { numeric: true }); });
        return '<div class="rg-floor"><div class="rg-floor-title">Floor ' + escRoom(f) + ' <small>' + list.length + ' rooms</small></div><div class="rg-cards">' + list.map(function (r) {
            var s = String(r.ROOM_STATUS);
            var id = escRoom(r.IDNo);
            return '<div class="rg-card rg-s' + escRoom(s) + '"><div class="rg-top"><span class="rg-num">#' + escRoom(r.ROOM_NUMBER) + '</span><span class="rg-badge">' + escRoom(names[s] || 'Unknown') + '</span></div>' +
                '<div class="rg-type">' + escRoom(r.ROOM_TYPE_NAME || '') + '</div>' +
                '<div class="rg-desc">' + escRoom(r.ROOM_DESCRIPTION || names[s] || '') + '</div>' +
                '<div class="rg-actions"><button type="button" onclick="editRoom(\'' + id + '\')" title="Edit Room"><i class="fa fa-pencil"></i></button><button type="button" class="rg-del" onclick="deleteRoom(\'' + id + '\')" title="Delete Room"><i class="fa fa-trash"></i></button></div></div>';
        }).join('') + '</div></div>';
    }).join('');
    $('#roomGrid').html(html || '<div style="opacity:.6">No rooms found.</div>');
    $('#roomGridCount').text(rooms.length + ' rooms');
}

function refreshCurrentTab() {
    console.log('Refreshing room data...');
    if (typeof reloadData === 'function') {
        reloadData();
    }
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadData() {
    $.ajax({
        url: '/room/api/rooms',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                roomGridData = response.data || [];
                renderRoomGrid();
            } else {
                console.error('Error loading room data:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading room data',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('AJAX Error:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to load room data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

// ========================================
// ROOM CRUD OPERATIONS
// ========================================

function createRoom() {
    
    const selectedAmenities = [];
    $('#addAmenitiesContainer input[type="checkbox"]:checked').each(function() {
        selectedAmenities.push($(this).val());
    });
    
    const formData = new FormData();

    // Add form fields  (room pricing lives in room_rates - no per-room price)
    formData.append('ROOM_TYPE_ID', $('#addRoomType').attr('data-value') || $('#addRoomType').val());
    formData.append('ROOM_NUMBER', $('#addRoomNumber').val());
    formData.append('ROOM_STATUS', roomStatusValue('#addRoomStatus'));
    formData.append('ROOM_MAX', $('#addRoomMax').val());
    formData.append('ROOM_BED', $('#addRoomBed').val());
    formData.append('ROOM_SIZE', $('#addRoomSize').val());
    formData.append('ROOM_VIEW', $('#addRoomView').val());
    formData.append('ROOM_DESCRIPTION', $('#addRoomDescription').val());
    formData.append('AMENITIES', JSON.stringify(selectedAmenities));
    
    
    $.ajax({
        url: '/room/api/rooms/create',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#addRoomModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Room created successfully',
                        icon: 'success',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#28a745'
                    }).then((result) => {
                        reloadData();
                    });
                }, 300);
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: 'Error creating room: ' + response.message,
                    icon: 'error',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('AJAX Error:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Error creating room. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function editRoom(roomId) {
    $.ajax({
        url: `/room/api/rooms/${roomId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditRoomForm(response.data);
                $('#editRoomModal').modal('show');
                loadRoomTypes('edit');
                loadAmenities('edit', response.data.AMENITIES || []);
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading room data: ' + response.message,
                    icon: 'error',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('AJAX Error:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Error loading room data',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function populateEditRoomForm(room) {
    // Set hidden ID
    $('#editRoomId').val(room.IDNo);
    
    // Set basic information
    $('#editRoomNumber').val(room.ROOM_NUMBER);
    $('#editRoomMax').val(room.ROOM_MAX);
    $('#editRoomSize').val(room.ROOM_SIZE);
    $('#editRoomDescription').val(room.ROOM_DESCRIPTION || '');
    
    // Set dropdowns
    $('#editRoomType').val(room.ROOM_TYPE_NAME || '');
    $('#editRoomType').attr('data-value', room.ROOM_TYPE_ID);
    $('#editRoomStatus').val(ROOM_STATUS_NAMES[String(room.ROOM_STATUS)] || '').attr('data-value', room.ROOM_STATUS).closest('.mdl-textfield').addClass('is-dirty');
    $('#editRoomBed').val(room.ROOM_BED);
    $('#editRoomView').val(room.ROOM_VIEW);

    // Populate amenities (will be done after amenities are loaded)
    window.currentRoomAmenities = room.AMENITIES || [];
    
    // Force floating labels after form is populated
    setTimeout(() => {
        const textfields = document.querySelectorAll('#editRoomModal .mdl-textfield');
        textfields.forEach(function(textfield) {
            const input = textfield.querySelector('.mdl-textfield__input');
            if (input && input.value) {
                textfield.classList.add('is-dirty');
                // Remove is-focused to prevent green underline by default
                textfield.classList.remove('is-focused');
            }
        });
    }, 300);
}

function updateRoom() {
    const selectedAmenities = [];
    $('#editAmenitiesContainer input[type="checkbox"]:checked').each(function() {
        selectedAmenities.push($(this).val());
    });
    
    const formData = new FormData();

    // Add form fields  (room pricing lives in room_rates - no per-room price)
    formData.append('IDNo', $('#editRoomId').val());
    formData.append('ROOM_TYPE_ID', $('#editRoomType').attr('data-value') || $('#editRoomType').val());
    formData.append('ROOM_NUMBER', $('#editRoomNumber').val());
    formData.append('ROOM_STATUS', roomStatusValue('#editRoomStatus'));
    formData.append('ROOM_MAX', $('#editRoomMax').val());
    formData.append('ROOM_BED', $('#editRoomBed').val());
    formData.append('ROOM_SIZE', $('#editRoomSize').val());
    formData.append('ROOM_VIEW', $('#editRoomView').val());
    formData.append('ROOM_DESCRIPTION', $('#editRoomDescription').val());
    formData.append('AMENITIES', JSON.stringify(selectedAmenities));
    
    
    $.ajax({
        url: '/room/api/rooms/update',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editRoomModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Room updated successfully',
                        icon: 'success',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#28a745'
                    }).then((result) => {
                        reloadData();
                    });
                }, 300);
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: 'Error updating room: ' + response.message,
                    icon: 'error',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('AJAX Error:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Error updating room. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}





function deleteRoom(roomId) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: `/room/api/rooms/${roomId}`,
                method: 'DELETE',
                dataType: 'json',
                success: function(response) {
                    if (response.success) {
                        Swal.fire(
                            'Deleted!',
                            'Room has been deleted successfully.',
                            'success'
                        ).then(() => {
                            reloadData();
                        });
                    } else {
                        Swal.fire(
                            'Error!',
                            'Error deleting room: ' + response.message,
                            'error'
                        );
                    }
                },
                error: function(xhr, status, error) {
                    console.error('AJAX Error:', error);
                    Swal.fire(
                        'Error!',
                        'Error deleting room',
                        'error'
                    );
                }
            });
        }
    });
}

// ========================================
// FORM POPULATION FUNCTIONS
// ========================================



// ========================================
// DROPDOWN LOADING FUNCTIONS
// ========================================

// Setup click handlers for MDL dropdowns
function setupDropdownClickHandlers() {
    // Room Type dropdowns
    $('#addRoomType, #editRoomType').on('click', function() {
        const ul = $(this).closest('.mdl-textfield').find('ul[data-mdl-for]');
        ul.toggleClass('is-visible');
    });
    
    // Room Status dropdowns
    $('#addRoomStatus, #editRoomStatus').on('click', function() {
        const ul = $(this).siblings('ul[data-mdl-for]');
        ul.toggleClass('is-visible');
    });
    
    // Bed Count dropdowns
    $('#addRoomBed, #editRoomBed').on('click', function() {
        const ul = $(this).siblings('ul[data-mdl-for]');
        ul.toggleClass('is-visible');
    });
    
    // Room View dropdowns
    $('#addRoomView, #editRoomView').on('click', function() {
        const ul = $(this).siblings('ul[data-mdl-for]');
        ul.toggleClass('is-visible');
    });
    
    // Close dropdowns when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.getmdl-select').length) {
            $('.mdl-menu.is-visible').removeClass('is-visible');
        }
    });
    
    // Setup click handlers for existing dropdown items
    setupExistingDropdownItemHandlers();
}

// Setup click handlers for existing static dropdown items
function setupExistingDropdownItemHandlers() {
    // Add global event delegation for Room Type dropdown items
    $(document).off('click', '[data-mdl-for*="RoomType"] .mdl-menu__item').on('click', '[data-mdl-for*="RoomType"] .mdl-menu__item', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const selectedValue = $(this).attr('data-val');
        const selectedText = $(this).text();
        const inputField = $('#' + $(this).closest('ul').attr('data-mdl-for'));
        
        // Set the input value and data-value
        inputField.val(selectedText);
        inputField.attr('data-value', selectedValue);
        
        // Add is-dirty class to show the label is floating
        inputField.closest('.mdl-textfield').addClass('is-dirty');
        
        // Get the ul element
        const ul = $(this).closest('ul');
        
        // Try to close dropdown using MDL's native method
        try {
            // Simulate clicking outside to close dropdown
            const clickEvent = new Event('click', { bubbles: true });
            document.body.dispatchEvent(clickEvent);
            
            // Also try to close using MDL's method
            if (window.componentHandler && ul[0]) {
                const mdlMenu = ul[0].MaterialMenu;
                if (mdlMenu && mdlMenu.hide) {
                    mdlMenu.hide();
                }
            }
        } catch (e) {
            // Silent fail - fallback will handle it
        }
        
        // Gentle close using only the is-visible class - don't break reopening
        ul.removeClass('is-visible');
    });
    
    // Room Status dropdown items
    $('[data-mdl-for="addRoomStatus"], [data-mdl-for="editRoomStatus"]').find('.mdl-menu__item').on('click', function() {
        const selectedValue = $(this).attr('data-val');
        const selectedText = $(this).text();
        const inputField = $('#' + $(this).closest('ul').attr('data-mdl-for'));
        
        // Set the input value and data-value
        inputField.val(selectedText);
        inputField.attr('data-value', selectedValue);
        
        // Add is-dirty class to show the label is floating
        inputField.closest('.mdl-textfield').addClass('is-dirty');
        
        // Close the dropdown
        $(this).closest('ul').removeClass('is-visible');
    });
    
    // Bed Count dropdown items
    $('[data-mdl-for="addRoomBed"], [data-mdl-for="editRoomBed"]').find('.mdl-menu__item').on('click', function() {
        const selectedValue = $(this).attr('data-val');
        const selectedText = $(this).text();
        const inputField = $('#' + $(this).closest('ul').attr('data-mdl-for'));
        const inputId = inputField.attr('id');
        
        // Set the input value and data-value
        inputField.val(selectedText);
        inputField.attr('data-value', selectedValue);
        
        // Add is-dirty class to show the label is floating
        inputField.closest('.mdl-textfield').addClass('is-dirty');
        
        // Show/hide seasonal pricing based on bed count selection
        if (selectedValue) {
            if (inputId === 'addRoomBed') {
                $('#addSeasonalPricingSection').show();
                $('#addNoBedCountMessage').hide();
                loadSeasonalPricing();
            } else if (inputId === 'editRoomBed') {
                $('#editSeasonalPricingSection').show();
                $('#editNoBedCountMessage').hide();
                loadEditSeasonalPricing();
            }
        } else {
            if (inputId === 'addRoomBed') {
                $('#addSeasonalPricingSection').hide();
                $('#addNoBedCountMessage').show();
                $('#addPricingTableBody').empty();
            } else if (inputId === 'editRoomBed') {
                $('#editSeasonalPricingSection').hide();
                $('#editNoBedCountMessage').show();
                $('#editPricingTableBody').empty();
            }
        }
        
        // Close the dropdown
        $(this).closest('ul').removeClass('is-visible');
    });
    
    // Room View dropdown items
    $('[data-mdl-for="addRoomView"], [data-mdl-for="editRoomView"]').find('.mdl-menu__item').on('click', function() {
        const selectedValue = $(this).attr('data-val');
        const selectedText = $(this).text();
        const inputField = $('#' + $(this).closest('ul').attr('data-mdl-for'));
        
        // Set the input value and data-value
        inputField.val(selectedText);
        inputField.attr('data-value', selectedValue);
        
        // Add is-dirty class to show the label is floating
        inputField.closest('.mdl-textfield').addClass('is-dirty');
        
        // Close the dropdown
        $(this).closest('ul').removeClass('is-visible');
    });
}



// Unified function to load room types for both add and edit
function loadRoomTypes(modalType = 'add') {
    $.ajax({
        url: '/room/api/room-types',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                const containerId = modalType === 'edit' ? '#editRoomType' : '#addRoomType';
                const prefix = modalType === 'edit' ? 'edit' : 'add';
                const roomTypeContainer = $(containerId);
                
                // Clear existing options
                const ul = roomTypeContainer.closest('.mdl-textfield').find('ul[data-mdl-for]');
                ul.empty();
                
                response.data.forEach(function(roomType) {
                    const li = document.createElement('li');
                    li.className = 'mdl-menu__item';
                    li.setAttribute('data-val', roomType.IDNo);
                    li.textContent = roomType.NAME;
                    ul.append(li);
                });
                
                // Add click event handlers for the dropdown items using event delegation
                ul.off('click', '.mdl-menu__item').on('click', '.mdl-menu__item', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const selectedValue = $(this).attr('data-val');
                    const selectedText = $(this).text();
                    const inputField = roomTypeContainer;
                    
                    // Set the input value and data-value
                    inputField.val(selectedText);
                    inputField.attr('data-value', selectedValue);
                    
                    // Add is-dirty class to show the label is floating
                    inputField.closest('.mdl-textfield').addClass('is-dirty');
                    
                    // Try to close dropdown using MDL's native method
                    try {
                        // Simulate clicking outside to close dropdown
                        const clickEvent = new Event('click', { bubbles: true });
                        document.body.dispatchEvent(clickEvent);
                        
                        // Also try to close using MDL's method
                        if (window.componentHandler && ul[0]) {
                            const mdlMenu = ul[0].MaterialMenu;
                            if (mdlMenu && mdlMenu.hide) {
                                mdlMenu.hide();
                            }
                        }
                    } catch (e) {
                        // Silent fail - fallback will handle it
                    }
                    
                    // Gentle close using only the is-visible class - don't break reopening
                    ul.removeClass('is-visible');
                });
                
                // Initialize MDL dropdown after adding options
                if (window.componentHandler) {
                    window.componentHandler.upgradeElements(document.querySelectorAll('.getmdl-select'));
                }
                if (window.originalComponentHandler) {
                    window.originalComponentHandler.upgradeElements(document.querySelectorAll('.getmdl-select'));
                }
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading room types:', error);
        }
    });
}

// Unified function to load amenities for both add and edit
function loadAmenities(modalType = 'add', selectedAmenities = []) {
    $.ajax({
        url: '/room/api/all-amenities',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                const containerId = modalType === 'edit' ? '#editAmenitiesContainer' : '#addAmenitiesContainer';
                const prefix = modalType === 'edit' ? 'edit' : 'add';
                const amenitiesContainer = $(containerId);
                amenitiesContainer.empty();
                
                response.data.forEach(function(amenity) {
                    // Check if this amenity is already selected for the room (for edit mode)
                    const isSelected = modalType === 'edit' && selectedAmenities && 
                        selectedAmenities.some(roomAmenity => roomAmenity.IDNo == amenity.IDNo);
                    
                    const amenityHtml = `
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" value="${amenity.IDNo}" id="${prefix}Amenity-${amenity.IDNo}" ${isSelected ? 'checked' : ''}>
                            <label class="form-check-label" for="${prefix}Amenity-${amenity.IDNo}">${amenity.NAME}</label>
                        </div>
                    `;
                    amenitiesContainer.append(amenityHtml);
                });
            } else {
                console.error('Error loading amenities:', response.message);
            }
        },
        error: function(xhr, status, error) {
            console.error('AJAX Error:', error);
        }
    });
}

 