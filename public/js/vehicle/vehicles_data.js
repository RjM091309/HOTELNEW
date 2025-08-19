// ========================================
// VEHICLE MANAGEMENT JAVASCRIPT
// ========================================

var dataTable;

$(document).ready(function() {
    setupFormHandlers();
    setupModalHandlers();
    initializeDataTable();
});

// ========================================
// FORM HANDLERS
// ========================================

function setupFormHandlers() {
    // Add Vehicle Form
    $('#addVehicleForm').on('submit', function(e) {
        e.preventDefault();
        createVehicle();
    });

    // Edit Vehicle Form
    $('#editVehicleForm').on('submit', function(e) {
        e.preventDefault();
        updateVehicle();
    });

    // Photo preview handlers
    $('#vehiclePhoto').on('change', function() {
        previewImage(this, '#photoPreview');
    });

    $('#editVehiclePhoto').on('change', function() {
        previewImage(this, '#editPhotoPreview');
    });
}

// ========================================
// MODAL HANDLERS
// ========================================

function setupModalHandlers() {
    // Add Vehicle Button
    $('#addVehicleBtn').on('click', function() {
        $('#addVehicleModal').modal('show');
    });

    // Clear forms when modals are hidden
    $('#addVehicleModal').on('hidden.bs.modal', function() {
        $('#addVehicleForm')[0].reset();
        $('#photoPreview').hide();
    });

    $('#editVehicleModal').on('hidden.bs.modal', function() {
        $('#editVehicleForm')[0].reset();
        $('#editPhotoPreview').hide();
    });
}

// ========================================
// DATA TABLE INITIALIZATION
// ========================================

function initializeDataTable() {
    if (dataTable) {
        dataTable.destroy();
    }

    dataTable = $('#vehiclesTable').DataTable({
        processing: true,
        serverSide: false,
        ajax: {
            url: '/vehicle/api/vehicles',
            type: 'GET',
            dataSrc: 'data'
        },
        columns: [
            {
                data: 'VEHICLE_PHOTO',
                render: function(data, type, row) {
                    const photoUrl = data ? `/uploads/vehicle/${data}` : '/img/vehicle/car-default.jpeg';
                    return `<img src="${photoUrl}" class="vehicle-photo" alt="Vehicle Photo" onclick="previewFullImage('${photoUrl}')">`;
                },
                orderable: false
            },
            { data: 'MODEL_NAME' },
            { data: 'VEHICLE_TYPE' },
            { data: 'COLOR' },
            { data: 'PLATE_NUMBER' },
            { data: 'FUEL_TYPE' },
            { data: 'REMARKS' },
            {
                data: 'IDNo',
                render: function(data, type, row) {
                    return `
                        <button class="btn btn-sm btn-primary edit-vehicle" data-id="${data}" title="Edit">
                            <i class="fa fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-vehicle" data-id="${data}" title="Delete">
                            <i class="fa fa-trash"></i>
                        </button>
                    `;
                },
                orderable: false
            }
        ],
        columnDefs: [
            { className: 'text-center', targets: [0, 7] }
        ],
        pageLength: 10,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "All"]],
        searching: true,
        ordering: true,
        autoWidth: false,
        responsive: true,
        language: {
            search: "Search vehicles:",
            lengthMenu: "Show _MENU_ vehicles per page",
            info: "Showing _START_ to _END_ of _TOTAL_ vehicles",
            infoEmpty: "Showing 0 to 0 of 0 vehicles",
            infoFiltered: "(filtered from _MAX_ total vehicles)",
            emptyTable: "No vehicles found"
        }
    });

    // Event handlers for edit and delete buttons
    $('#vehiclesTable').on('click', '.edit-vehicle', function() {
        const vehicleId = $(this).data('id');
        editVehicle(vehicleId);
    });

    $('#vehiclesTable').on('click', '.delete-vehicle', function() {
        const vehicleId = $(this).data('id');
        deleteVehicle(vehicleId);
    });

    reloadData();
}

// ========================================
// CRUD OPERATIONS
// ========================================

function createVehicle() {
    const formData = new FormData($('#addVehicleForm')[0]);
    
    $.ajax({
        url: '/vehicle/api/vehicles/create',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.success) {
                $('#addVehicleModal').modal('hide');
                setTimeout(function() {
                    Swal.fire({
                        icon: 'success',
                        title: 'Success!',
                        text: response.message,
                        confirmButtonText: 'OK'
                    }).then(() => {
                        reloadData();
                    });
                }, 100);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: response.message,
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Error creating vehicle:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'Failed to create vehicle. Please try again.',
                confirmButtonText: 'OK'
            });
        }
    });
}

function updateVehicle() {
    const formData = new FormData($('#editVehicleForm')[0]);
    
    $.ajax({
        url: '/vehicle/api/vehicles/update',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.success) {
                $('#editVehicleModal').modal('hide');
                setTimeout(function() {
                    Swal.fire({
                        icon: 'success',
                        title: 'Success!',
                        text: response.message,
                        confirmButtonText: 'OK'
                    }).then(() => {
                        reloadData();
                    });
                }, 100);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: response.message,
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Error updating vehicle:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'Failed to update vehicle. Please try again.',
                confirmButtonText: 'OK'
            });
        }
    });
}

function editVehicle(vehicleId) {
    $.ajax({
        url: `/vehicle/api/vehicles/${vehicleId}`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                const vehicle = response.data;
                
                $('#editVehicleId').val(vehicle.IDNo);
                $('#editModelName').val(vehicle.MODEL_NAME);
                $('#editVehicleType').val(vehicle.VEHICLE_TYPE);
                $('#editColor').val(vehicle.COLOR);
                $('#editPlateNumber').val(vehicle.PLATE_NUMBER);
                $('#editFuelType').val(vehicle.FUEL_TYPE);
                $('#editRemarks').val(vehicle.REMARKS);
                
                // Show existing photo if available
                if (vehicle.VEHICLE_PHOTO) {
                    const photoUrl = `/uploads/vehicle/${vehicle.VEHICLE_PHOTO}`;
                    $('#editPhotoPreview').attr('src', photoUrl).show();
                } else {
                    $('#editPhotoPreview').hide();
                }
                
                $('#editVehicleModal').modal('show');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: response.message,
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Error fetching vehicle:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'Failed to fetch vehicle data. Please try again.',
                confirmButtonText: 'OK'
            });
        }
    });
}

function deleteVehicle(vehicleId) {
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
                url: `/vehicle/api/vehicles/${vehicleId}`,
                type: 'DELETE',
                success: function(response) {
                    if (response.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Deleted!',
                            text: response.message,
                            confirmButtonText: 'OK'
                        }).then(() => {
                            reloadData();
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error!',
                            text: response.message,
                            confirmButtonText: 'OK'
                        });
                    }
                },
                error: function(xhr, status, error) {
                    console.error('Error deleting vehicle:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error!',
                        text: 'Failed to delete vehicle. Please try again.',
                        confirmButtonText: 'OK'
                    });
                }
            });
        }
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function reloadData() {
    if (dataTable) {
        dataTable.ajax.reload();
    }
}

function previewImage(input, previewSelector) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            $(previewSelector).attr('src', e.target.result).show();
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        $(previewSelector).hide();
    }
}

function previewFullImage(imageUrl) {
    Swal.fire({
        imageUrl: imageUrl,
        imageAlt: 'Vehicle Photo',
        width: 'auto',
        confirmButtonText: 'Close'
    });
} 