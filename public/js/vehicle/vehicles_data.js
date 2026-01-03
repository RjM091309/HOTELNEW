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

    // Enhanced photo preview handlers
    $('#vehiclePhoto').on('change', function() {
        handleFileUpload(this, '#photoPreview', '#photoPreviewContainer', '#fileInfo', '#fileName', '#fileSize', '#uploadError', '#errorText', '#fileUploadArea');
    });

    $('#editVehiclePhoto').on('change', function() {
        handleFileUpload(this, '#editPhotoPreview', '#editPhotoPreviewContainer', '#editFileInfo', '#editFileName', '#editFileSize', '#editUploadError', '#editErrorText', '#editFileUploadArea');
    });

    // Remove file handlers
    $('#removeFileBtn').on('click', function() {
        removeFile('#vehiclePhoto', '#photoPreview', '#photoPreviewContainer', '#fileInfo', '#uploadError', '#fileUploadArea');
    });

    $('#editRemoveFileBtn').on('click', function() {
        removeFile('#editVehiclePhoto', '#editPhotoPreview', '#editPhotoPreviewContainer', '#editFileInfo', '#editUploadError', '#editFileUploadArea');
    });

    // Drag and drop handlers for add vehicle
    setupDragAndDrop('#fileUploadArea', '#vehiclePhoto');
    
    // Drag and drop handlers for edit vehicle
    setupDragAndDrop('#editFileUploadArea', '#editVehiclePhoto');
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
        resetFileUploadInterface('#photoPreview', '#photoPreviewContainer', '#fileInfo', '#uploadError', '#fileUploadArea');
    });

    $('#editVehicleModal').on('hidden.bs.modal', function() {
        $('#editVehicleForm')[0].reset();
        resetFileUploadInterface('#editPhotoPreview', '#editPhotoPreviewContainer', '#editFileInfo', '#editUploadError', '#editFileUploadArea');
    });

    // Handle cancel button clicks for modals
    $('[data-dismiss="modal"]').on('click', function() {
        $(this).closest('.modal').modal('hide');
    });

    // Handle modal close events
    $('.modal').on('hidden.bs.modal', function() {
        // Reset form when modal is closed
        if ($(this).attr('id') === 'editVehicleModal') {
            $('#editVehicleForm')[0].reset();
        }
    });

    // Initialize MDL components when add modal is shown
    $('#addVehicleModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            
            // Add event listeners for MDL dropdown changes
            setupDropdownChangeHandlers();
        }, 300);
    });

    // Initialize MDL components when edit modal is shown
    $('#editVehicleModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Also try to initialize with original handler if available
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            
            // Force floating labels for all textfields with values
            const textfields = document.querySelectorAll('#editVehicleModal .mdl-textfield');
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
    $('.btn-secondary[data-bs-dismiss="modal"]').on('click', function() {
        $(this).closest('.modal').modal('hide');
    });

    // Handle close button (X) clicks
    $('.modal .close').on('click', function() {
        $(this).closest('.modal').modal('hide');
    });
}

// Setup dropdown change handlers for MDL dropdowns
function setupDropdownChangeHandlers() {
    // Handle Vehicle Type dropdown changes
    $('#vehicleType, #editVehicleType').off('change').on('change', function() {
        const selectedText = $(this).val();
        if (selectedText) {
            $(this).attr('data-value', selectedText);
        }
    });

    // Handle Fuel Type dropdown changes
    $('#fuelType, #editFuelType').off('change').on('change', function() {
        const selectedText = $(this).val();
        if (selectedText) {
            $(this).attr('data-value', selectedText);
        }
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
            { 
                data: 'GPS_DEVICE_ID',
                render: function(data, type, row) {
                    return data ? `<span class="badge bg-info">${data}</span>` : '<span class="text-muted">Not assigned</span>';
                }
            },
            { data: 'REMARKS' },
            {
                data: 'IDNo',
                render: function(data, type, row) {
                    return `
                        <button type="button" class="btn btn-tbl-edit btn-xs" onclick="openEditModal('${data}')" title="Edit Vehicle">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteVehicle('${data}')" title="Delete Vehicle">
                            <i class="fa fa-trash"></i>
                        </button>
                    `;
                },
                orderable: false
            }
        ],
        columnDefs: [
            { className: 'text-center', targets: [0, 8] },
            { targets: [8], width: '15%', orderable: false, searchable: false }
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

    // Event handlers are now handled by onclick functions in the rendered buttons

    reloadData();
}

// ========================================
// CRUD OPERATIONS
// ========================================

function createVehicle() {
    const formData = new FormData($('#addVehicleForm')[0]);
    
    // Get values from MDL dropdowns
    const vehicleType = $('#vehicleType').attr('data-value') || $('#vehicleType').val();
    const fuelType = $('#fuelType').attr('data-value') || $('#fuelType').val();
    
    // Update form data with actual values
    formData.set('vehicleType', vehicleType);
    formData.set('fuelType', fuelType);
    
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
    
    // Get values from MDL dropdowns
    const vehicleType = $('#editVehicleType').attr('data-value') || $('#editVehicleType').val();
    const fuelType = $('#editFuelType').attr('data-value') || $('#editFuelType').val();
    
    // Update form data with actual values
    formData.set('vehicleType', vehicleType);
    formData.set('fuelType', fuelType);
    
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



function openEditModal(vehicleId) {
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
                $('#editGpsDeviceId').val(vehicle.GPS_DEVICE_ID || '');
                $('#editRemarks').val(vehicle.REMARKS);
                
                // Store the actual values for form submission
                $('#editVehicleType').attr('data-value', vehicle.VEHICLE_TYPE);
                $('#editFuelType').attr('data-value', vehicle.FUEL_TYPE);
                
                // Show existing photo if available
                if (vehicle.VEHICLE_PHOTO) {
                    const photoUrl = `/uploads/vehicle/${vehicle.VEHICLE_PHOTO}`;
                    $('#editPhotoPreview').attr('src', photoUrl).show();
                } else {
                    $('#editPhotoPreview').hide();
                }
                
                $('#editVehicleModal').modal('show');
                
                // Force floating labels after modal is shown
                setTimeout(() => {
                    const textfields = document.querySelectorAll('#editVehicleModal .mdl-textfield');
                    textfields.forEach(function(textfield) {
                        const input = textfield.querySelector('.mdl-textfield__input');
                        if (input && input.value) {
                            textfield.classList.add('is-dirty');
                            // Remove is-focused to prevent green underline by default
                            textfield.classList.remove('is-focused');
                        }
                    });
                }, 300);
                
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

function handleFileUpload(input, previewSelector, previewContainerSelector, fileInfoSelector, fileNameSelector, fileSizeSelector, errorSelector, errorTextSelector, uploadAreaSelector) {
    const file = input.files[0];
    const maxSize = parseInt($(input).data('max-size')) || 5; // Default 5MB
    
    // Hide any previous errors
    $(errorSelector).hide();
    
    if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showUploadError(errorSelector, errorTextSelector, 'Please select a valid image file.');
            return;
        }
        
        // Validate file size (MB)
        if (file.size > maxSize * 1024 * 1024) {
            showUploadError(errorSelector, errorTextSelector, `File size must be less than ${maxSize}MB.`);
            return;
        }
        
        // Show file info
        $(fileNameSelector).text(file.name);
        $(fileSizeSelector).text(formatFileSize(file.size));
        $(fileInfoSelector).show();
        
        // Update upload area styling
        $(uploadAreaSelector).addClass('has-file');
        
        // Preview image
        const reader = new FileReader();
        reader.onload = function(e) {
            $(previewSelector).attr('src', e.target.result);
            $(previewContainerSelector).show();
        };
        reader.readAsDataURL(file);
    }
}

function removeFile(inputSelector, previewSelector, previewContainerSelector, fileInfoSelector, errorSelector, uploadAreaSelector) {
    // Clear the file input
    $(inputSelector).val('');
    
    // Hide preview and file info
    $(previewContainerSelector).hide();
    $(fileInfoSelector).hide();
    
    // Hide any errors
    $(errorSelector).hide();
    
    // Reset upload area styling
    $(uploadAreaSelector).removeClass('has-file');
    
    // Clear preview image
    $(previewSelector).attr('src', '#');
}

function showUploadError(errorSelector, errorTextSelector, message) {
    $(errorTextSelector).text(message);
    $(errorSelector).show();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setupDragAndDrop(uploadAreaSelector, inputSelector) {
    const uploadArea = $(uploadAreaSelector);
    const input = $(inputSelector);
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea[0].addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea[0].addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea[0].addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    uploadArea[0].addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        uploadArea.addClass('dragover');
    }
    
    function unhighlight(e) {
        uploadArea.removeClass('dragover');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            input[0].files = files;
            input.trigger('change');
        }
    }
}

function resetFileUploadInterface(previewSelector, previewContainerSelector, fileInfoSelector, errorSelector, uploadAreaSelector) {
    // Hide all elements
    $(previewContainerSelector).hide();
    $(fileInfoSelector).hide();
    $(errorSelector).hide();
    
    // Reset upload area styling
    $(uploadAreaSelector).removeClass('has-file');
    
    // Clear preview image
    $(previewSelector).attr('src', '#');
}

function previewImage(input, previewSelector) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            $(previewSelector).attr('src', e.target.result).show();
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewFullImage(imageUrl) {
    Swal.fire({
        imageUrl: imageUrl,
        imageAlt: 'Vehicle Photo',
        width: '80%',
        confirmButtonText: 'Close'
    });
}

function reloadData() {
    if (dataTable) {
        dataTable.ajax.reload();
    }
}

// Global function to close modals
function closeModal(modalId) {
    $(modalId).modal('hide');
} 