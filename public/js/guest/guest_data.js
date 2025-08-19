let dataTable;



function initializeDataTable() {
    // Wait for DataTable plugin to be available
    if (typeof $.fn.DataTable === 'undefined') {
        setTimeout(initializeDataTable, 100);
        return;
    }

    if ($.fn.DataTable.isDataTable('#guestTable')) {
        $('#guestTable').DataTable().destroy();
    }

    // Initialize DataTable with enhanced configuration from beastdatatable.js
    dataTable = $("#guestTable").DataTable({
        columnDefs: [
            { targets: [2, 3, 4], className: "text-center" },
            { targets: [4], width: '10%', orderable: false, searchable: false }
        ],
        pageLength: 15,
        lengthMenu: [
            [15, 25, 50, 100],
            [15, 25, 50, 100],
        ],
        autoWidth: false,
        responsive: true,
        order: [[0, 'asc']], // Sort by guest name by default
        deferRender: true, // Optimize for large datasets
        processing: true, // Show processing indicator
        searching: true,
        ordering: true,
        language: {
            "search": "Search:"
        }
    });
    
    // Load initial data
    reloadData();
}

// Initialize when document is ready
$(document).ready(function() {
    // Wait a bit to ensure all scripts are loaded
    setTimeout(function() {
        initializeDataTable();
    }, 200);
    
    // Handle edit form submission
    $('#editGuestForm').on('submit', function(e) {
        e.preventDefault();
        saveGuestChanges();
    });
    
    // Handle cancel button clicks for modals
    $('[data-dismiss="modal"]').on('click', function() {
        $(this).closest('.modal').modal('hide');
    });
    
    // Handle modal close events
    $('.modal').on('hidden.bs.modal', function() {
        // Reset form when modal is closed
        if ($(this).attr('id') === 'editGuestModal') {
            $('#editGuestForm')[0].reset();
        }
    });
    
    // Initialize MDL components when edit modal is shown
    $('#editGuestModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            
            // Force floating labels for all textfields with values
            const textfields = document.querySelectorAll('#editGuestModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                const input = textfield.querySelector('.mdl-textfield__input');
                if (input && input.value) {
                    textfield.classList.add('is-dirty');
                    // Remove is-focused to prevent green underline by default
                    textfield.classList.remove('is-focused');
                }
            });
            
            // Add event listeners for MDL dropdown changes
            setupDropdownChangeHandlers();
        }, 300);
    });
    
    // Additional event handlers for close buttons
    $('.btn-secondary[data-dismiss="modal"]').on('click', function() {
        $(this).closest('.modal').modal('hide');
    });
    
    // Handle close button (X) clicks
    $('.modal .close').on('click', function() {
        $(this).closest('.modal').modal('hide');
    });
});


function reloadData() {
    PMSCore.debugLog('Reloading guest data');
    
    $.ajax({
        url: '/guest/api/guests',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            try {
                PMSCore.validateResponse(response);
                
                // Clear existing data
                dataTable.clear();
                
                // Update table with new data
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(guest) {

                        // Label constants
                        const typeLabels = {'1': 'Golf', '2': 'Group', '3': 'Casino', '4': 'Learning', '5': 'Relaxing', '6': 'Entertainment', '7': 'Investment'};
                        const levelLabels = {'1': 'VIP', '2': 'Regular', '3': 'New Guest'};
                        
                        // Format phone number function
                        const formatPhoneNumber = (phone) => {
                            if (!phone || phone === 'N/A') return 'N/A';
                            const cleaned = phone.toString().replace(/\D/g, '');
                            if (cleaned.length === 11) {
                                return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
                            } else if (cleaned.length === 10) {
                                return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
                            }
                            return phone;
                        };
                        
                        var btn = `
                          
                                <button type="button" class=" btn btn-tbl-view btn-xs " onclick="viewGuestDetails('${guest.IDNo}')" title="View Guest Details">
                                    <i class="fa fa-eye"></i>
                                </button>
                                <button type="button" class=" btn btn-tbl-edit btn-xs " onclick="openEditModal('${guest.IDNo}')" title="Edit Guest">
                                    <i class="fa fa-pencil"></i>
                                </button>
                            
                        `;
                        
                        dataTable.row.add([
                            guest.NAME || 'N/A',
                            formatPhoneNumber(guest.CONTACTNo),
                            typeLabels[guest.TYPE] || 'Unknown',
                            levelLabels[guest.LEVEL] || 'Unknown',
                            btn
                        ]);
                    });
                    dataTable.draw();
                    PMSCore.debugLog(`Loaded ${response.data.length} guests`);
                }
            } catch (error) {
                PMSCore.handleError(error, 'reloadData');
            }
        },
        error: function(xhr, status, error) {
            PMSCore.handleError(error, 'reloadData AJAX');
        }
    });
}



// Open edit modal function
function openEditModal(guestId) {
    PMSCore.debugLog(`Opening edit modal for guest ID: ${guestId}`);
    
    $.ajax({
        url: `/guest/api/guests/${guestId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            try {
                PMSCore.validateResponse(response);
                const guest = response.data;
                
                // Label constants for display
                const typeLabels = {'1': 'Golf', '2': 'Group', '3': 'Casino', '4': 'Learning', '5': 'Relaxing', '6': 'Entertainment', '7': 'Investment'};
                const levelLabels = {'1': 'VIP', '2': 'Regular', '3': 'New Guest'};
                
                $('#editGuestId').val(guest.IDNo);
                $('#editGuestName').val(guest.NAME);
                $('#editGuestPhone').val(guest.CONTACTNo);
                
                // Set values for MDL dropdowns
                $('#editGuestType').val(typeLabels[guest.TYPE] || '');
                $('#editGuestLevel').val(levelLabels[guest.LEVEL] || '');
                
                // Store the actual values for form submission
                $('#editGuestType').attr('data-value', guest.TYPE);
                $('#editGuestLevel').attr('data-value', guest.LEVEL);
                
                $('#editGuestModal').modal('show');
                
                // Force floating labels after modal is shown
                setTimeout(() => {
                    const textfields = document.querySelectorAll('#editGuestModal .mdl-textfield');
                    textfields.forEach(function(textfield) {
                        const input = textfield.querySelector('.mdl-textfield__input');
                        if (input && input.value) {
                            textfield.classList.add('is-dirty');
                            // Remove is-focused to prevent green underline by default
                            textfield.classList.remove('is-focused');
                        }
                    });
                }, 300);
                
                PMSCore.debugLog('Edit modal populated successfully');
            } catch (error) {
                PMSCore.handleError(error, 'openEditModal');
            }
        },
        error: function(xhr, status, error) {
            PMSCore.handleError(error, 'openEditModal AJAX');
        }
    });
}

// Setup dropdown change handlers for MDL dropdowns
function setupDropdownChangeHandlers() {
    // Handle Customer Type dropdown changes
    $('#editGuestType').on('change', function() {
        const selectedText = $(this).val();
        const typeValues = {'Golf': '1', 'Group': '2', 'Casino': '3', 'Learning': '4', 'Relaxing': '5', 'Entertainment': '6', 'Investment': '7'};
        const selectedValue = typeValues[selectedText];
        if (selectedValue) {
            $(this).attr('data-value', selectedValue);
        }
    });
    
    // Handle Customer Level dropdown changes
    $('#editGuestLevel').on('change', function() {
        const selectedText = $(this).val();
        const levelValues = {'VIP': '1', 'Regular': '2', 'New Guest': '3'};
        const selectedValue = levelValues[selectedText];
        if (selectedValue) {
            $(this).attr('data-value', selectedValue);
        }
    });
}

// Save guest changes function
function saveGuestChanges() {
    PMSCore.debugLog('Saving guest changes');
    
    // Get the current values from data-value attributes
    const typeValue = $('#editGuestType').attr('data-value');
    const levelValue = $('#editGuestLevel').attr('data-value');
    
    const formData = {
        IDNo: $('#editGuestId').val(),
        NAME: $('#editGuestName').val(),
        CONTACTNo: $('#editGuestPhone').val(),
        TYPE: typeValue,
        LEVEL: levelValue
    };
    
    // Debug logging
    PMSCore.debugLog('Form data to be sent:', formData);
    PMSCore.debugLog('Type value:', typeValue);
    PMSCore.debugLog('Level value:', levelValue);
    
    $.ajax({
        url: '/guest/api/guests/update',
        method: 'POST',
        data: formData,
        dataType: 'json',
        success: function(response) {
            try {
                PMSCore.validateResponse(response);
                $('#editGuestModal').modal('hide');
                
                PMSCore.showSuccess('Success!', 'Guest updated successfully');
                PMSCore.debugLog('Guest updated successfully');
                
                // Reload data after successful update
                reloadData();
            } catch (error) {
                PMSCore.handleError(error, 'saveGuestChanges');
            }
        },
        error: function(xhr, status, error) {
            PMSCore.handleError(error, 'saveGuestChanges AJAX');
        }
    });
}

// Global function to close modals
function closeModal(modalId) {
    $(modalId).modal('hide');
}

// Simple view guest details function - calls the new view_guest.js
function viewGuestDetails(guestId) {
    // This function is now handled by view_guest.js
    if (typeof window.viewGuestDetailsFromNewFile === 'function') {
        window.viewGuestDetailsFromNewFile(guestId);
    } else {
        // Fallback - just show the modal
        $('#viewGuestModal').modal('show');
    }
}




