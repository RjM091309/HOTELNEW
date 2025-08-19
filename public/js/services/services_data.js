// ========================================
// SERVICES MANAGEMENT - MAIN JAVASCRIPT
// ========================================

var dataTable;

// ========================================
// INITIALIZATION
// ========================================

$(document).ready(function() {
    initializeDataTable();
    setupFormHandlers();
    setupModalHandlers();
});

// ========================================
// EVENT HANDLERS SETUP
// ========================================

function setupFormHandlers() {
    $('#addServiceForm').on('submit', function(e) {
        e.preventDefault();
        createService();
    });
    
    $('#editServiceForm').on('submit', function(e) {
        e.preventDefault();
        updateService();
    });
}

function setupModalHandlers() {
    // Add Service button handler
    $(document).on('click', '#addServiceBtn', function() {
        $('#addServiceModal').modal('show');
    });
}

// ========================================
// DATATABLE CONFIGURATION
// ========================================

function initializeDataTable() {
    if ($.fn.DataTable.isDataTable('#servicesTable')) {
        $('#servicesTable').DataTable().destroy();
    }

    dataTable = $("#servicesTable").DataTable({
        columnDefs: [
            { targets: [5], className: "text-center" },
            { targets: [5], orderable: false, searchable: false }
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
    
    reloadData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadData() {
    $.ajax({
        url: '/services/api/services',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                dataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(service) {
                        const cost = parseFloat(service.SERVICE_COST).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        });
                        
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editService('${service.IDNo}')" title="Edit Service">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteService('${service.IDNo}')" title="Delete Service">
                                <i class="fa fa-trash"></i>
                            </button>
                        `;
                        
                        // Create availability badge
                        const availability = service.SERVICE_AVAILABILITY || '';
                        let availabilityBadge;
                        if (availability === 'Available') {
                            availabilityBadge = '<span class="badge badge-success">Available</span>';
                        } else if (availability === 'Unavailable') {
                            availabilityBadge = '<span class="badge badge-warning">Unavailable</span>';
                        } else {
                            availabilityBadge = availability;
                        }
                        
                        dataTable.row.add([
                            service.SERVICE_CATEGORY || '',
                            service.SERVICE_NAME || '',
                            service.SERVICE_DESCRIPTION || '',
                            '₱' + cost,
                            availabilityBadge,
                            actions
                        ]);
                    });
                    dataTable.draw();
                }
            } else {
                console.error('Error loading services data:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading services data',
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
                text: 'Failed to load services data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

// ========================================
// SERVICES CRUD OPERATIONS
// ========================================

function createService() {
    // Validate required fields
    const serviceCategory = $('#addServiceCategory').val();
    const serviceName = $('#addServiceName').val();
    const serviceDescription = $('#addServiceDescription').val();
    const serviceCost = $('#addServiceCost').val();
    const serviceAvailability = $('#addServiceAvailability').val();
    
    if (!serviceCategory || !serviceName || !serviceDescription || !serviceCost || !serviceAvailability) {
        Swal.fire({
            title: 'Missing Required Fields!',
            text: 'Please fill in all required fields.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Validate cost is a positive number
    if (isNaN(serviceCost) || parseFloat(serviceCost) <= 0) {
        Swal.fire({
            title: 'Invalid Cost!',
            text: 'Cost must be a positive number.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    

    
    const formData = {
        serviceCategory: serviceCategory,
        serviceName: serviceName,
        serviceDescription: serviceDescription,
        serviceCost: parseFloat(serviceCost),
        serviceAvailability: serviceAvailability
    };
    
    $.ajax({
        url: '/services/api/services/create',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#addServiceModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Service created successfully',
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
                    text: 'Error creating service: ' + response.message,
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
                text: 'Error creating service. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function updateService() {
    // Validate required fields
    const serviceId = $('#editServiceId').val();
    const serviceCategory = $('#editServiceCategory').val();
    const serviceName = $('#editServiceName').val();
    const serviceDescription = $('#editServiceDescription').val();
    const serviceCost = $('#editServiceCost').val();
    const serviceAvailability = $('#editServiceAvailability').val();
    
    if (!serviceId || !serviceCategory || !serviceName || !serviceDescription || !serviceCost || !serviceAvailability) {
        Swal.fire({
            title: 'Missing Required Fields!',
            text: 'Please fill in all required fields.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Validate cost is a positive number
    if (isNaN(serviceCost) || parseFloat(serviceCost) <= 0) {
        Swal.fire({
            title: 'Invalid Cost!',
            text: 'Cost must be a positive number.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    

    
    const formData = {
        serviceId: serviceId,
        serviceCategory: serviceCategory,
        serviceName: serviceName,
        serviceDescription: serviceDescription,
        serviceCost: parseFloat(serviceCost),
        serviceAvailability: serviceAvailability
    };
    
    $.ajax({
        url: '/services/api/services/update',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editServiceModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Service updated successfully',
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
                    text: 'Error updating service: ' + response.message,
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
                text: 'Error updating service. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function editService(serviceId) {
    $.ajax({
        url: `/services/api/services/${serviceId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditForm(response.data);
                $('#editServiceModal').modal('show');
            } else {
                console.error('Error loading service details:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading service details',
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
                text: 'Failed to load service details',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function deleteService(serviceId) {
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
                url: `/services/api/services/${serviceId}`,
                method: 'DELETE',
                dataType: 'json',
                success: function(response) {
                    if (response.success) {
                        Swal.fire(
                            'Deleted!',
                            'Service has been deleted successfully.',
                            'success'
                        ).then(() => {
                            reloadData();
                        });
                    } else {
                        Swal.fire(
                            'Error!',
                            'Error deleting service: ' + response.message,
                            'error'
                        );
                    }
                },
                error: function(xhr, status, error) {
                    console.error('AJAX Error:', error);
                    Swal.fire(
                        'Error!',
                        'Error deleting service',
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

function populateEditForm(service) {
    $('#editServiceId').val(service.IDNo);
    $('#editServiceCategory').val(service.SERVICE_CATEGORY);
    $('#editServiceName').val(service.SERVICE_NAME);
    $('#editServiceDescription').val(service.SERVICE_DESCRIPTION);
    $('#editServiceCost').val(service.SERVICE_COST);
    $('#editServiceAvailability').val(service.SERVICE_AVAILABILITY);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function formatCost(cost) {
    if (!cost) return '₱0.00';
    
    const numCost = parseFloat(cost);
    if (isNaN(numCost)) return '₱0.00';
    
    return '₱' + numCost.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
} 