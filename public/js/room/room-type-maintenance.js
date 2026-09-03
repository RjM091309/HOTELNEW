// ========================================
// ROOM TYPE MAINTENANCE
// ========================================

// ========================================
// MDL HELPER FUNCTIONS
// ========================================

function initializeMDLComponents(element) {
    try {
        if (window.componentHandler && typeof window.componentHandler.upgradeElements === 'function') {
            if (element) {
                window.componentHandler.upgradeElements(element);
            } else {
                window.componentHandler.upgradeElements();
            }
        }
    } catch (error) {
        console.warn('MDL initialization failed:', error);
    }
}

// ========================================
// DATATABLE CONFIGURATION
// ========================================

function initializeRoomTypeDataTable() {
    if ($('#roomTypeTable').length === 0) {
        console.error('Room Type table not found!');
        return;
    }
    
    if ($.fn.DataTable.isDataTable('#roomTypeTable')) {
        $('#roomTypeTable').DataTable().destroy();
    }

    roomTypeDataTable = $("#roomTypeTable").DataTable({
        columnDefs: [
            { targets: [3], className: "text-center" },
            { targets: [3], orderable: false, searchable: false }
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
    
    reloadRoomTypeData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadRoomTypeData() {
    console.log('Loading room type data...');
    
    $.ajax({
        url: '/room/api/room-types',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            console.log('Room type API response:', response);
            if (response.success) {
                roomTypeDataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(roomType) {
                        const description = roomType.DESCRIPTION || '-';

                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editRoomType('${roomType.IDNo}')" title="Edit Room Type">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteRoomType('${roomType.IDNo}')" title="Delete Room Type">
                                <i class="fa fa-trash"></i>
                            </button>
                        `;
                        
                        roomTypeDataTable.row.add([
                            roomType.IDNo,
                            roomType.NAME,
                            description,
                            actions
                        ]);
                    });
                }
                roomTypeDataTable.draw();
                console.log('Room type data loaded successfully');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading room type data:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to load room type data',
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

function createRoomType() {
    const form = document.getElementById('addRoomTypeForm');
    const formData = {
        NAME: form.querySelector('[name="NAME"]').value,
        DESCRIPTION: form.querySelector('[name="DESCRIPTION"]').value
    };

    console.log('Form data being sent:', formData);
    
    $.ajax({
        url: '/room/api/room-types/create',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            console.log('Success response:', response);
            if (response.success) {
                $('#addRoomTypeModal').modal('hide');
                document.getElementById('addRoomTypeForm').reset();
                
                // Reinitialize MDL components after form reset
                initializeMDLComponents(document.getElementById('addRoomTypeModal'));
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Room type created successfully',
                        icon: 'success',
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'OK'
                    });
                }, 300);
                
                reloadRoomTypeData();
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to create room type',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Error response:', xhr.responseText);
            console.error('Status:', status);
            console.error('Error:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to create room type',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function editRoomType(id) {
    $.ajax({
        url: `/room/api/room-types/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                populateEditRoomTypeForm(response.data);
                $('#editRoomTypeModal').modal('show');
                
                // Initialize MDL components after modal is shown
                setTimeout(() => {
                    initializeMDLComponents(document.getElementById('editRoomTypeModal'));
                }, 100);
            }
        }
    });
}

function populateEditRoomTypeForm(roomType) {
    document.getElementById('editRoomTypeId').value = roomType.IDNo;
    document.getElementById('editRoomTypeName').value = roomType.NAME;
    document.getElementById('editRoomTypeDescription').value = roomType.DESCRIPTION || '';

    // Force floating labels after form is populated
    setTimeout(() => {
        const textfields = document.querySelectorAll('#editRoomTypeModal .mdl-textfield');
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

function updateRoomType() {
    const form = document.getElementById('editRoomTypeForm');
    const formData = {
        IDNo: form.querySelector('[name="IDNo"]').value,
        NAME: form.querySelector('[name="NAME"]').value,
        DESCRIPTION: form.querySelector('[name="DESCRIPTION"]').value
    };
    
    console.log('Update form data:', formData);
    
    $.ajax({
        url: '/room/api/room-types/update',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            console.log('Update response:', response);
            if (response.success) {
                $('#editRoomTypeModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Room type updated successfully',
                        icon: 'success',
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'OK'
                    });
                }, 300);
                
                reloadRoomTypeData();
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to update room type',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Update error:', xhr.responseText);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to update room type',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function deleteRoomType(id) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: `/room/api/room-types/${id}`,
                method: 'DELETE',
                success: function(response) {
                    if (response.success) {
                        Swal.fire(
                            'Deleted!',
                            'Room type has been deleted.',
                            'success'
                        );
                        reloadRoomTypeData();
                    } else {
                        Swal.fire({
                            title: 'Error!',
                            text: response.message || 'Failed to delete room type',
                            icon: 'error',
                            confirmButtonColor: '#d33',
                            confirmButtonText: 'OK'
                        });
                    }
                },
                error: function() {
                    Swal.fire({
                        title: 'Error!',
                        text: 'Failed to delete room type',
                        icon: 'error',
                        confirmButtonColor: '#d33',
                        confirmButtonText: 'OK'
                    });
                }
            });
        }
    });
}

// ========================================
// EVENT LISTENERS
// ========================================

$(document).ready(function() {
    // Initialize MDL components when document is ready
    initializeMDLComponents();
    
    $(document).on('click', '#addRoomTypeBtn', function() {
        $('#addRoomTypeModal').modal('show');
        
        // Initialize MDL components after modal is shown
        setTimeout(() => {
            initializeMDLComponents(document.getElementById('addRoomTypeModal'));
        }, 100);
    });
    
    $(document).on('submit', '#addRoomTypeForm', function(e) {
        e.preventDefault();
        createRoomType();
    });
    
    $(document).on('submit', '#editRoomTypeForm', function(e) {
        e.preventDefault();
        updateRoomType();
    });
    
    // Modal event handlers
    $('#addRoomTypeModal').on('shown.bs.modal', function() {
        // Initialize MDL components when modal is shown
        initializeMDLComponents(this);
    });
    
    $('#editRoomTypeModal').on('shown.bs.modal', function() {
        // Initialize MDL components when modal is shown
        initializeMDLComponents(this);
    });
    
    $('#addRoomTypeModal').on('hidden.bs.modal', function() {
        document.getElementById('addRoomTypeForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#addRoomTypeModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Add room type form cleared');
    });
    
    $('#editRoomTypeModal').on('hidden.bs.modal', function() {
        document.getElementById('editRoomTypeForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#editRoomTypeModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Edit room type form cleared');
    });
    
    $(document).on('click', '#addRoomTypeModal .btn-secondary, #addRoomTypeModal .btn-close', function() {
        document.getElementById('addRoomTypeForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#addRoomTypeModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Add room type form cleared via cancel/close');
    });
    
    $(document).on('click', '#editRoomTypeModal .btn-secondary, #editRoomTypeModal .btn-close', function() {
        document.getElementById('editRoomTypeForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#editRoomTypeModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Edit room type form cleared via cancel/close');
    });
}); 