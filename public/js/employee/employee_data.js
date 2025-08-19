// ========================================
// EMPLOYEE MANAGEMENT - MAIN JAVASCRIPT
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
    $('#addEmployeeForm').on('submit', function(e) {
        e.preventDefault();
        createEmployee();
    });
    
    $('#editEmployeeForm').on('submit', function(e) {
        e.preventDefault();
        updateEmployee();
    });
}

function setupModalHandlers() {
    // Add Employee button handler
    $(document).on('click', '#addEmployeeBtn', function() {
        $('#addEmployeeModal').modal('show');
    });
    
    // Photo preview handlers
    $(document).on('change', '#addPhoto', function() {
        previewImage(this, '#addPhotoPreview');
    });
    
    $(document).on('change', '#editPhoto', function() {
        previewImage(this, '#editPhotoPreview');
    });
}

// ========================================
// DATATABLE CONFIGURATION
// ========================================

function initializeDataTable() {
    if ($.fn.DataTable.isDataTable('#employeeTable')) {
        $('#employeeTable').DataTable().destroy();
    }

    dataTable = $("#employeeTable").DataTable({
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
    
    reloadData();
}

// ========================================
// DATA OPERATIONS
// ========================================

function reloadData() {
    $.ajax({
        url: '/employee/api/employees',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                dataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(employee) {
                        // Handle photo URL - check for valid photo or use default
                        let photoUrl;
                        if (employee.PHOTO && employee.PHOTO !== '' && 
                            employee.PHOTO !== 'default-image.png' && 
                            employee.PHOTO !== 'employee-default.png') {
                            photoUrl = `/img/employee/${employee.PHOTO}`;
                        } else {
                            photoUrl = '/img/employee/employee-default.png';
                        }
                        const employeeImage = `<img src="${photoUrl}" class="img-circle" width="50" height="50" alt="Employee Photo" style="object-fit: cover;" onerror="this.src='/img/employee/employee-default.png'">`;
                        
                        const contact = formatContactNumber(employee.CONTACTNo || '');
                        const dateStarted = employee.DATE_STARTED ? new Date(employee.DATE_STARTED).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                        }) : '';
                        
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editEmployee('${employee.IDNo}')" title="Edit Employee">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteEmployee('${employee.IDNo}')" title="Delete Employee">
                                <i class="fa fa-trash"></i>
                            </button>
                        `;
                        
                        dataTable.row.add([
                            employeeImage,
                            employee.FULLNAME || '',
                            employee.DEPARTMENT || '',
                            contact,
                            employee.ADDRESS || '',
                            dateStarted,
                            actions
                        ]);
                    });
                    dataTable.draw();
                }
            } else {
                console.error('Error loading employee data:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading employee data',
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
                text: 'Failed to load employee data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

// ========================================
// EMPLOYEE CRUD OPERATIONS
// ========================================

function createEmployee() {
    // Validate contact number
    const contactNo = $('#addContactNo').val();
    const cleanedContact = contactNo.replace(/\D/g, '');
    
    if (cleanedContact.length !== 11) {
        Swal.fire({
            title: 'Invalid Contact Number!',
            text: 'Contact number must be exactly 11 digits (e.g., 09091234567)',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    

    
    const formData = new FormData();
    
    // Add form fields
    formData.append('fullName', $('#addFullName').val());
    formData.append('department', $('#addDepartment').val());
    formData.append('contactNo', cleanedContact);
    formData.append('address', $('#addAddress').val());
    formData.append('dateStarted', $('#addDateStarted').val());
    
    // Add image file if selected
    const imageFile = $('#addPhoto')[0].files[0];
    if (imageFile) {
        formData.append('photo', imageFile);
    }
    
    $.ajax({
        url: '/employee/api/employees/create',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#addEmployeeModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Employee created successfully',
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
                    text: 'Error creating employee: ' + response.message,
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
                text: 'Error creating employee. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function updateEmployee() {
    // Validate contact number
    const contactNo = $('#editContactNo').val();
    const cleanedContact = contactNo.replace(/\D/g, '');
    
    if (cleanedContact.length !== 11) {
        Swal.fire({
            title: 'Invalid Contact Number!',
            text: 'Contact number must be exactly 11 digits (e.g., 09091234567)',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    

    
    const formData = new FormData();
    
    // Add form fields
    formData.append('employeeId', $('#editEmployeeId').val());
    formData.append('fullName', $('#editFullName').val());
    formData.append('department', $('#editDepartment').val());
    formData.append('contactNo', cleanedContact);
    formData.append('address', $('#editAddress').val());
    formData.append('dateStarted', $('#editDateStarted').val());
    
    // Add image file if selected
    const imageFile = $('#editPhoto')[0].files[0];
    if (imageFile) {
        formData.append('photo', imageFile);
    }
    
    $.ajax({
        url: '/employee/api/employees/update',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editEmployeeModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'Employee updated successfully',
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
                    text: 'Error updating employee: ' + response.message,
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
                text: 'Error updating employee. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function editEmployee(employeeId) {
    $.ajax({
        url: `/employee/api/employees/${employeeId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditForm(response.data);
                $('#editEmployeeModal').modal('show');
            } else {
                console.error('Error loading employee details:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading employee details',
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
                text: 'Failed to load employee details',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function deleteEmployee(employeeId) {
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
                url: `/employee/api/employees/${employeeId}`,
                method: 'DELETE',
                dataType: 'json',
                success: function(response) {
                    if (response.success) {
                        Swal.fire(
                            'Deleted!',
                            'Employee has been deleted successfully.',
                            'success'
                        ).then(() => {
                            reloadData();
                        });
                    } else {
                        Swal.fire(
                            'Error!',
                            'Error deleting employee: ' + response.message,
                            'error'
                        );
                    }
                },
                error: function(xhr, status, error) {
                    console.error('AJAX Error:', error);
                    Swal.fire(
                        'Error!',
                        'Error deleting employee',
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

function populateEditForm(employee) {
    $('#editEmployeeId').val(employee.IDNo);
    $('#editFullName').val(employee.FULLNAME);
    $('#editDepartment').val(employee.DEPARTMENT);
    $('#editContactNo').val(employee.CONTACTNo);
    $('#editAddress').val(employee.ADDRESS);
    
    // Handle date formatting for HTML date input
    if (employee.DATE_STARTED) {
        const date = new Date(employee.DATE_STARTED);
        const formattedDate = date.toISOString().split('T')[0];
        $('#editDateStarted').val(formattedDate);
    } else {
        $('#editDateStarted').val('');
    }
    
    // Show current photo
    if (employee.PHOTO && employee.PHOTO !== '' && 
        employee.PHOTO !== 'default-image.png' && 
        employee.PHOTO !== 'employee-default.png') {
        $('#editPhotoPreview').attr('src', `/img/employee/${employee.PHOTO}`).show();
    } else {
        $('#editPhotoPreview').attr('src', '/img/employee/employee-default.png').show();
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function formatContactNumber(contact) {
    if (!contact) return '';
    
    // Remove all non-digit characters
    const cleaned = contact.toString().replace(/\D/g, '');
    
    // Check if it's exactly 11 digits
    if (cleaned.length === 11) {
        // Format as 0909-888-1234
        return cleaned.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1-$2-$3');
    }
    
    // If not 11 digits, return as is
    return contact;
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