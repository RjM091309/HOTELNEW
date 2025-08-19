// ========================================
// GUEST TYPE MAINTENANCE
// ========================================

// ========================================
// DATATABLE CONFIGURATION
// ========================================

var guestTypeDataTable;

function initializeGuestTypeDataTable() {
    if ($('#guestTypeTable').length === 0) {
        console.error('Guest Type table not found!');
        return;
    }
    
    if ($.fn.DataTable.isDataTable('#guestTypeTable')) {
        $('#guestTypeTable').DataTable().destroy();
    }

    guestTypeDataTable = $("#guestTypeTable").DataTable({
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
    
    reloadGuestTypeData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadGuestTypeData() {
    $.ajax({
        url: '/guest/guest_type/get-all',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                guestTypeDataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(guestType) {
                        const statusBadge = guestType.ACTIVE == 1 
                            ? '<span class="badge badge-success">Active</span>'
                            : '<span class="badge badge-danger">Inactive</span>';
                        
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editGuestType(${guestType.IDNo})" title="Edit Guest Type">
                                <i class="fa fa-pencil"></i>
                            </button>
                        `;
                        
                        guestTypeDataTable.row.add([
                            guestType.TYPE,
                            statusBadge,
                            actions
                        ]);
                    });
                }
                guestTypeDataTable.draw();
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to load guest type data',
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

function createGuestType() {
    const formData = {
        txtTypeGuest: $('#addGuestTypeName').val(),
        ACTIVE: $('#addGuestTypeActive').val()
    };

    if (!formData.txtTypeGuest || !formData.ACTIVE) {
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
        url: '/guest/guest_type/add',
        method: 'POST',
        data: formData,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#addGuestTypeModal').modal('hide');
                $('#addGuestTypeForm')[0].reset();
                reloadGuestTypeData();
                
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
                text: 'Failed to create guest type',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function editGuestType(id) {
    $.ajax({
        url: `/guest/guest_type/get/${id}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditGuestTypeForm(response.data);
                $('#editGuestTypeModal').modal('show');
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
                text: 'Failed to fetch guest type details',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function populateEditGuestTypeForm(guestType) {
    $('#editGuestTypeId').val(guestType.IDNo);
    $('#editGuestTypeName').val(guestType.TYPE);
    
    // Convert status value to display text for MDL dropdown
    const statusLabels = {'1': 'Active', '0': 'Inactive'};
    const statusText = statusLabels[guestType.ACTIVE] || 'Active';
    $('#editGuestTypeActive').val(statusText);
    
    // Store the actual value for form submission
    $('#editGuestTypeActive').attr('data-value', guestType.ACTIVE);
    
    // Initialize MDL components after populating form
    setTimeout(() => {
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(document.querySelectorAll('#editGuestTypeModal .mdl-textfield'));
        }
        // Also try to initialize with original handler if available
        if (window.originalComponentHandler) {
            window.originalComponentHandler.upgradeElements(document.querySelectorAll('#editGuestTypeModal .mdl-textfield'));
        }
        
        // Force floating labels for all textfields with values
        const textfields = document.querySelectorAll('#editGuestTypeModal .mdl-textfield');
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

function updateGuestType() {
    const id = $('#editGuestTypeId').val();
    const formData = {
        TYPE: $('#editGuestTypeName').val(),
        ACTIVE: $('#editGuestTypeActive').attr('data-value') || $('#editGuestTypeActive').val()
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
        url: `/guest/guest_type/edit/${id}`,
        method: 'PUT',
        data: formData,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editGuestTypeModal').modal('hide');
                reloadGuestTypeData();
                
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
                text: 'Failed to update guest type',
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
    $('#manageGuestTypesBtn').on('click', function() {
        $('#guestTypesManagementModal').modal('show');
        if (!guestTypeDataTable) {
            initializeGuestTypeDataTable();
        }
    });

    $('#addGuestTypeBtn').on('click', function() {
        $('#addGuestTypeModal').modal('show');
        $('#addGuestTypeForm')[0].reset();
    });
    
    // Initialize MDL components when add modal is shown
    $('#addGuestTypeModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('#addGuestTypeModal .mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('#addGuestTypeModal .mdl-textfield'));
            }
        }, 300);
    });
    
    // Initialize MDL components when edit modal is shown
    $('#editGuestTypeModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('#editGuestTypeModal .mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('#editGuestTypeModal .mdl-textfield'));
            }
            
            // Add change handler for status dropdown
            $('#editGuestTypeActive').off('change').on('change', function() {
                const selectedText = $(this).val();
                const statusValues = {'Active': '1', 'Inactive': '0'};
                const selectedValue = statusValues[selectedText];
                if (selectedValue) {
                    $(this).attr('data-value', selectedValue);
                }
            });
        }, 300);
    });

    $('#addGuestTypeForm').on('submit', function(e) {
        e.preventDefault();
        createGuestType();
    });

    $('#editGuestTypeForm').on('submit', function(e) {
        e.preventDefault();
        updateGuestType();
    });
}); 