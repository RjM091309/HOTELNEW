// ========================================
// AMENITY MAINTENANCE
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

function initializeAmenityDataTable() {
    if ($('#amenityTable').length === 0) {
        console.error('Amenity table not found!');
        return;
    }
    
    if ($.fn.DataTable.isDataTable('#amenityTable')) {
        $('#amenityTable').DataTable().destroy();
    }

    amenityDataTable = $("#amenityTable").DataTable({
        columnDefs: [
            { targets: [6], className: "text-center" },
            { targets: [6], orderable: false, searchable: false }
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
    
    reloadAmenityData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadAmenityData() {
    console.log('Loading amenity data...');
    
    $.ajax({
        url: '/room/api/all-amenities',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            console.log('Amenity API response:', response);
            if (response.success) {
                amenityDataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(amenity) {
                        const cost = amenity.COST && !isNaN(amenity.COST)
                            ? parseFloat(amenity.COST).toLocaleString('en-PH', {
                                style: 'currency',
                                currency: 'PHP'
                              })
                            : 'Free';
                        
                        const description = amenity.DESCRIPTION || '-';
                        
                        // Create availability badge
                        const availability = amenity.AVAILABILITY || '';
                        let availabilityBadge;
                        if (availability === 'Available') {
                            availabilityBadge = '<span class="badge badge-success">Available</span>';
                        } else if (availability === 'Not Available') {
                            availabilityBadge = '<span class="badge badge-danger">Not Available</span>';
                        } else {
                            availabilityBadge = availability;
                        }
                        
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editAmenity('${amenity.IDNo}')" title="Edit Amenity">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteAmenity('${amenity.IDNo}')" title="Delete Amenity">
                                <i class="fa fa-trash"></i>
                            </button>
                        `;
                        
                        amenityDataTable.row.add([
                            amenity.IDNo,
                            amenity.NAME,
                            description,
                            amenity.IS_PAID,
                            cost,
                            availabilityBadge,
                            actions
                        ]);
                    });
                }
                amenityDataTable.draw();
                console.log('Amenity data loaded successfully');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading amenity data:', error);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to load amenity data',
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

function createAmenity() {
    const form = document.getElementById('addAmenityForm');
    const formData = {
        NAME: form.querySelector('[name="NAME"]').value,
        DESCRIPTION: form.querySelector('[name="DESCRIPTION"]').value,
        IS_PAID: form.querySelector('[name="IS_PAID"]').value,
        COST: form.querySelector('[name="COST"]').value || null,
        AVAILABILITY: form.querySelector('[name="AVAILABILITY"]').value
    };
    
    console.log('Create amenity data:', formData);
    
    if (!formData.NAME || !formData.IS_PAID || !formData.AVAILABILITY) {
        Swal.fire({
            title: 'Error!',
            text: 'Please fill in all required fields',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    if (formData.IS_PAID === 'Paid' && (!formData.COST || formData.COST <= 0)) {
        Swal.fire({
            title: 'Error!',
            text: 'Cost is required and must be greater than 0 for paid amenities',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    $.ajax({
        url: '/room/api/amenities/create',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            console.log('Create amenity response:', response);
            if (response.success) {
                $('#addAmenityModal').modal('hide');
                document.getElementById('addAmenityForm').reset();
                
                // Reinitialize MDL components after form reset
                initializeMDLComponents(document.getElementById('addAmenityModal'));
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Amenity created successfully',
                        icon: 'success',
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'OK'
                    });
                }, 300);
                
                reloadAmenityData();
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to create amenity',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Create amenity error:', xhr.responseText);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to create amenity',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function editAmenity(id) {
    $.ajax({
        url: `/room/api/amenities/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                populateEditAmenityForm(response.data);
                $('#editAmenityModal').modal('show');
                
                // Initialize MDL components after modal is shown
                setTimeout(() => {
                    initializeMDLComponents(document.getElementById('editAmenityModal'));
                }, 100);
            }
        }
    });
}

function populateEditAmenityForm(amenity) {
    document.getElementById('editAmenityId').value = amenity.IDNo;
    document.getElementById('editAmenityName').value = amenity.NAME;
    document.getElementById('editAmenityDescription').value = amenity.DESCRIPTION || '';
    document.getElementById('editAmenityType').value = amenity.IS_PAID;
    document.getElementById('editAmenityCost').value = amenity.COST || '';
    document.getElementById('editAmenityAvailability').value = amenity.AVAILABILITY;
    
    if (amenity.IS_PAID === 'Paid') {
        $('#editCostFieldGroup').show();
    } else {
        $('#editCostFieldGroup').hide();
    }
    
    // Force floating labels after form is populated
    setTimeout(() => {
        const textfields = document.querySelectorAll('#editAmenityModal .mdl-textfield');
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

function updateAmenity() {
    const form = document.getElementById('editAmenityForm');
    const formData = {
        IDNo: form.querySelector('[name="IDNo"]').value,
        NAME: form.querySelector('[name="NAME"]').value,
        DESCRIPTION: form.querySelector('[name="DESCRIPTION"]').value,
        IS_PAID: form.querySelector('[name="IS_PAID"]').value,
        COST: form.querySelector('[name="COST"]').value || null,
        AVAILABILITY: form.querySelector('[name="AVAILABILITY"]').value
    };
    
    console.log('Update amenity data:', formData);
    
    if (!formData.NAME || !formData.IS_PAID || !formData.AVAILABILITY) {
        Swal.fire({
            title: 'Error!',
            text: 'Please fill in all required fields',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    if (formData.IS_PAID === 'Paid' && (!formData.COST || formData.COST <= 0)) {
        Swal.fire({
            title: 'Error!',
            text: 'Cost is required and must be greater than 0 for paid amenities',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    $.ajax({
        url: '/room/api/amenities/update',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            console.log('Update amenity response:', response);
            if (response.success) {
                $('#editAmenityModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Amenity updated successfully',
                        icon: 'success',
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'OK'
                    });
                }, 300);
                
                reloadAmenityData();
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to update amenity',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error('Update amenity error:', xhr.responseText);
            Swal.fire({
                title: 'Error!',
                text: 'Failed to update amenity',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function deleteAmenity(id) {
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
                url: `/room/api/amenities/${id}`,
                method: 'DELETE',
                success: function(response) {
                    if (response.success) {
                        Swal.fire(
                            'Deleted!',
                            'Amenity has been deleted.',
                            'success'
                        );
                        reloadAmenityData();
                    } else {
                        Swal.fire({
                            title: 'Error!',
                            text: response.message || 'Failed to delete amenity',
                            icon: 'error',
                            confirmButtonColor: '#d33',
                            confirmButtonText: 'OK'
                        });
                    }
                },
                error: function() {
                    Swal.fire({
                        title: 'Error!',
                        text: 'Failed to delete amenity',
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
    
    $(document).on('click', '#addAmenityBtn', function() {
        $('#addAmenityModal').modal('show');
        
        // Initialize MDL components after modal is shown
        setTimeout(() => {
            initializeMDLComponents(document.getElementById('addAmenityModal'));
        }, 100);
    });
    
    $(document).on('submit', '#addAmenityForm', function(e) {
        e.preventDefault();
        createAmenity();
    });
    
    $(document).on('submit', '#editAmenityForm', function(e) {
        e.preventDefault();
        updateAmenity();
    });
    
    $(document).on('change', '#addAmenityType, #editAmenityType', function() {
        const isPaid = $(this).val();
        const costFieldGroup = $(this).closest('form').find('#costFieldGroup, #editCostFieldGroup');
        const costField = $(this).closest('form').find('input[name="COST"]');
        
        console.log('Type changed to:', isPaid);
        console.log('Cost field group found:', costFieldGroup.length > 0);
        
        if (isPaid === 'Paid') {
            costFieldGroup.show();
            costField.prop('required', true);
            costField.attr('placeholder', 'Enter cost (required for paid amenity)');
            console.log('Cost field shown and required');
        } else {
            costFieldGroup.hide();
            costField.prop('required', false);
            costField.val('');
            costField.attr('placeholder', 'Enter cost if paid amenity');
            console.log('Cost field hidden and not required');
        }
    });
    
    // Modal event handlers
    $('#addAmenityModal').on('shown.bs.modal', function() {
        // Initialize MDL components when modal is shown
        initializeMDLComponents(this);
    });
    
    $('#editAmenityModal').on('shown.bs.modal', function() {
        // Initialize MDL components when modal is shown
        initializeMDLComponents(this);
    });
    
    $('#addAmenityModal').on('hidden.bs.modal', function() {
        document.getElementById('addAmenityForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#addAmenityModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Add amenity form cleared');
    });
    
    $('#editAmenityModal').on('hidden.bs.modal', function() {
        document.getElementById('editAmenityForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#editAmenityModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Edit amenity form cleared');
    });
    
    $(document).on('click', '#addAmenityModal .btn-secondary, #addAmenityModal .btn-close', function() {
        document.getElementById('addAmenityForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#addAmenityModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Add amenity form cleared via cancel/close');
    });
    
    $(document).on('click', '#editAmenityModal .btn-secondary, #editAmenityModal .btn-close', function() {
        document.getElementById('editAmenityForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#editAmenityModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Edit amenity form cleared via cancel/close');
    });
}); 