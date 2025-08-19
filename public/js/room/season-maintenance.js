// ========================================
// SEASON MAINTENANCE
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

function initializeSeasonDataTable() {
    if ($('#seasonTable').length === 0) {
        console.error('Season table not found!');
        return;
    }
    
    if ($.fn.DataTable.isDataTable('#seasonTable')) {
        $('#seasonTable').DataTable().destroy();
    }

    seasonDataTable = $("#seasonTable").DataTable({
        columnDefs: [
            { targets: [4], className: "text-center" },
            { targets: [4], orderable: false, searchable: false },
            {
                targets: [1, 2], // Target the date columns (Start Date and End Date)
                render: function(data, type, row) {
                    if (type === 'display') {
                        let date = new Date(data);
                        return date.toLocaleDateString('en-US', { 
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                        });
                    }
                    return data;
                }
            }
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
    
    reloadSeasonData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadSeasonData() {
    $.ajax({
        url: '/room/api/seasons',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                seasonDataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(season) {
                        const statusBadge = season.ACTIVE == 1 
                            ? '<span class="badge badge-success">Active</span>'
                            : '<span class="badge badge-danger">Inactive</span>';
                        
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editSeason('${season.IDNo}')" title="Edit Season">
                                <i class="fa fa-pencil"></i>
                            </button>
                        `;
                        
                        seasonDataTable.row.add([
                            season.NAME,
                            season.START_DATE,
                            season.END_DATE,
                            statusBadge,
                            actions
                        ]);
                    });
                }
                seasonDataTable.draw();
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to load season data',
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

function createSeason() {
    const form = document.getElementById('addSeasonForm');
    const formData = {
        NAME: form.querySelector('[name="NAME"]').value,
        START_DATE: form.querySelector('[name="START_DATE"]').value,
        END_DATE: form.querySelector('[name="END_DATE"]').value,
        ACTIVE: form.querySelector('[name="ACTIVE"]').value
    };
    
    if (!formData.NAME || !formData.START_DATE || !formData.END_DATE || formData.ACTIVE === '') {
        Swal.fire({
            title: 'Error!',
            text: 'Please fill in all required fields',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Validate date range
    if (new Date(formData.START_DATE) >= new Date(formData.END_DATE)) {
        Swal.fire({
            title: 'Error!',
            text: 'End date must be after start date',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    $.ajax({
        url: '/room/api/seasons/create',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#addSeasonModal').modal('hide');
                document.getElementById('addSeasonForm').reset();
                
                // Reinitialize MDL components after form reset
                initializeMDLComponents(document.getElementById('addSeasonModal'));
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Season created successfully',
                        icon: 'success',
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'OK'
                    });
                }, 300);
                
                reloadSeasonData();
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to create season',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to create season',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function editSeason(id) {
    $.ajax({
        url: `/room/api/seasons/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                populateEditSeasonForm(response.data);
                $('#editSeasonModal').modal('show');
                
                // Initialize MDL components after modal is shown
                setTimeout(() => {
                    initializeMDLComponents(document.getElementById('editSeasonModal'));
                }, 100);
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to fetch season data',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to fetch season data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function populateEditSeasonForm(season) {
    document.getElementById('editSeasonId').value = season.IDNo;
    document.getElementById('editSeasonName').value = season.NAME;
    
    // Dates are now returned in YYYY-MM-DD format from API
    document.getElementById('editSeasonStartDate').value = season.START_DATE || '';
    document.getElementById('editSeasonEndDate').value = season.END_DATE || '';
    document.getElementById('editSeasonActive').value = season.ACTIVE;
    
    // Force floating labels after form is populated
    setTimeout(() => {
        const textfields = document.querySelectorAll('#editSeasonModal .mdl-textfield');
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

function updateSeason() {
    const form = document.getElementById('editSeasonForm');
    const formData = {
        IDNo: form.querySelector('[name="IDNo"]').value,
        NAME: form.querySelector('[name="NAME"]').value,
        START_DATE: form.querySelector('[name="START_DATE"]').value,
        END_DATE: form.querySelector('[name="END_DATE"]').value,
        ACTIVE: form.querySelector('[name="ACTIVE"]').value
    };
    
    if (!formData.NAME || !formData.START_DATE || !formData.END_DATE || formData.ACTIVE === '') {
        Swal.fire({
            title: 'Error!',
            text: 'Please fill in all required fields',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Validate date range
    if (new Date(formData.START_DATE) >= new Date(formData.END_DATE)) {
        Swal.fire({
            title: 'Error!',
            text: 'End date must be after start date',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    $.ajax({
        url: '/room/api/seasons/update',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editSeasonModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Season updated successfully',
                        icon: 'success',
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'OK'
                    });
                }, 300);
                
                reloadSeasonData();
            } else {
                Swal.fire({
                    title: 'Error!',
                    text: response.message || 'Failed to update season',
                    icon: 'error',
                    confirmButtonColor: '#d33',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(xhr, status, error) {
            Swal.fire({
                title: 'Error!',
                text: 'Failed to update season',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
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
    
    $(document).on('click', '#addSeasonBtn', function() {
        $('#addSeasonModal').modal('show');
        
        // Initialize MDL components after modal is shown
        setTimeout(() => {
            initializeMDLComponents(document.getElementById('addSeasonModal'));
        }, 100);
    });
    
    $(document).on('submit', '#addSeasonForm', function(e) {
        e.preventDefault();
        createSeason();
    });
    
    $(document).on('submit', '#editSeasonForm', function(e) {
        e.preventDefault();
        updateSeason();
    });
    
    // Modal event handlers
    $('#addSeasonModal').on('shown.bs.modal', function() {
        // Initialize MDL components when modal is shown
        initializeMDLComponents(this);
    });
    
    $('#editSeasonModal').on('shown.bs.modal', function() {
        // Initialize MDL components when modal is shown
        initializeMDLComponents(this);
    });
    
    $('#addSeasonModal').on('hidden.bs.modal', function() {
        document.getElementById('addSeasonForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#addSeasonModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Add season form cleared');
    });
    
    $('#editSeasonModal').on('hidden.bs.modal', function() {
        document.getElementById('editSeasonForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#editSeasonModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Edit season form cleared');
    });
    
    $(document).on('click', '#addSeasonModal .btn-secondary, #addSeasonModal .btn-close', function() {
        document.getElementById('addSeasonForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#addSeasonModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Add season form cleared via cancel/close');
    });
    
    $(document).on('click', '#editSeasonModal .btn-secondary, #editSeasonModal .btn-close', function() {
        document.getElementById('editSeasonForm').reset();
        
        // Reset floating labels after form reset
        setTimeout(() => {
            const textfields = document.querySelectorAll('#editSeasonModal .mdl-textfield');
            textfields.forEach(function(textfield) {
                textfield.classList.remove('is-dirty', 'is-focused');
            });
        }, 100);
        
        console.log('Edit season form cleared via cancel/close');
    });
}); 