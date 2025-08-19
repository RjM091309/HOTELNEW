// ========================================
// GUEST LEVEL MAINTENANCE
// ========================================

// ========================================
// DATATABLE CONFIGURATION
// ========================================

var guestLevelDataTable;

function initializeGuestLevelDataTable() {
    if ($('#guestLevelTable').length === 0) {
        console.error('Guest Level table not found!');
        return;
    }
    
    if ($.fn.DataTable.isDataTable('#guestLevelTable')) {
        $('#guestLevelTable').DataTable().destroy();
    }

    guestLevelDataTable = $("#guestLevelTable").DataTable({
        columnDefs: [
            { targets: [1, 2], width: "10%", className: "text-center" },
            { targets: [2], orderable: false, searchable: false }
        ],
        pageLength: 10,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        searching: true,
        ordering: true,
        autoWidth: false,
        responsive: true,
        language: {
            search: "Search:"
        }
    });
    
    reloadGuestLevelData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadGuestLevelData() {
    $.ajax({
        url: '/guest/guest_level/get-all',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                guestLevelDataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(guestLevel) {
                        const statusBadge = guestLevel.ACTIVE == 1 
                            ? '<span class="badge badge-success">Active</span>'
                            : '<span class="badge badge-danger">Inactive</span>';
                        
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editGuestLevel(${guestLevel.IDNo})" title="Edit Guest Level">
                                <i class="fa fa-pencil"></i>
                            </button>
                        `;
                        
                        guestLevelDataTable.row.add([
                            guestLevel.TYPE,
                            statusBadge,
                            actions
                        ]);
                    });
                }
                guestLevelDataTable.draw();
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to load guest level data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

// ========================================
// CRUD OPERATIONS
// ========================================

function createGuestLevel() {
    const formData = {
        TYPE: $('#addGuestLevelName').val(),
        ACTIVE: $('#addGuestLevelActive').val()
    };

    if (!formData.TYPE || !formData.ACTIVE) {
        Swal.fire({
            title: 'Validation Error!',
            text: 'Please fill in all required fields',
            icon: 'warning',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'OK'
        });
        return;
    }

    $.ajax({
        url: '/guest/guest_level/add',
        method: 'POST',
        data: formData,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#addGuestLevelModal').modal('hide');
                $('#addGuestLevelForm')[0].reset();
                reloadGuestLevelData();
                
                Swal.fire({
                    title: 'Success!',
                    text: response.message,
                    icon: 'success',
                    confirmButtonColor: '#28a745',
                    confirmButtonText: 'OK'
                });
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message,
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to create guest level',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function editGuestLevel(id) {
    $.ajax({
        url: `/guest/guest_level/get/${id}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditGuestLevelForm(response.data);
                $('#editGuestLevelModal').modal('show');
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message,
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to fetch guest level details',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function populateEditGuestLevelForm(guestLevel) {
    $('#editGuestLevelId').val(guestLevel.IDNo);
    $('#editGuestLevelName').val(guestLevel.TYPE);
    
    // Convert status value to display text for MDL dropdown
    const statusLabels = {'1': 'Active', '0': 'Inactive'};
    const statusText = statusLabels[guestLevel.ACTIVE] || 'Active';
    $('#editGuestLevelActive').val(statusText);
    
    // Store the actual value for form submission
    $('#editGuestLevelActive').attr('data-value', guestLevel.ACTIVE);
    
    // Initialize MDL components after populating form
    setTimeout(() => {
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(document.querySelectorAll('#editGuestLevelModal .mdl-textfield'));
        }
        // Also try to initialize with original handler if available
        if (window.originalComponentHandler) {
            window.originalComponentHandler.upgradeElements(document.querySelectorAll('#editGuestLevelModal .mdl-textfield'));
        }
        
        // Force floating labels for all textfields with values
        const textfields = document.querySelectorAll('#editGuestLevelModal .mdl-textfield');
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

function updateGuestLevel() {
    const id = $('#editGuestLevelId').val();
    const formData = {
        TYPE: $('#editGuestLevelName').val(),
        ACTIVE: $('#editGuestLevelActive').attr('data-value') || $('#editGuestLevelActive').val()
    };

    if (!formData.TYPE || !formData.ACTIVE) {
        Swal.fire({
            title: 'Validation Error!',
            text: 'Please fill in all required fields',
            icon: 'warning',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'OK'
        });
        return;
    }

    $.ajax({
        url: `/guest/guest_level/edit/${id}`,
        method: 'PUT',
        data: formData,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editGuestLevelModal').modal('hide');
                reloadGuestLevelData();
                
                Swal.fire({
                    title: 'Success!',
                    text: response.message,
                    icon: 'success',
                    confirmButtonColor: '#28a745',
                    confirmButtonText: 'OK'
                });
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message,
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to update guest level',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

// ========================================
// EVENT HANDLERS
// ========================================

$(document).ready(function() {
    $('#manageGuestLevelsBtn').on('click', function() {
        $('#guestLevelsManagementModal').modal('show');
        if (!guestLevelDataTable) {
            initializeGuestLevelDataTable();
        }
    });

    $('#addGuestLevelBtn').on('click', function() {
        $('#addGuestLevelModal').modal('show');
        $('#addGuestLevelForm')[0].reset();
    });
    
    // Initialize MDL components when add modal is shown
    $('#addGuestLevelModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('#addGuestLevelModal .mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('#addGuestLevelModal .mdl-textfield'));
            }
        }, 300);
    });
    
    // Initialize MDL components when edit modal is shown
    $('#editGuestLevelModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('#editGuestLevelModal .mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('#editGuestLevelModal .mdl-textfield'));
            }
            
            // Add change handler for status dropdown
            $('#editGuestLevelActive').off('change').on('change', function() {
                const selectedText = $(this).val();
                const statusValues = {'Active': '1', 'Inactive': '0'};
                const selectedValue = statusValues[selectedText];
                if (selectedValue) {
                    $(this).attr('data-value', selectedValue);
                }
            });
        }, 300);
    });

    $('#addGuestLevelForm').on('submit', function(e) {
        e.preventDefault();
        createGuestLevel();
    });

    $('#editGuestLevelForm').on('submit', function(e) {
        e.preventDefault();
        updateGuestLevel();
    });
}); 