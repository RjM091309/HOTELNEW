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
    setupDatePickerForAdd();
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

// ========================================
// MDL DROPDOWN HANDLERS FOR EMPLOYEE
// ========================================

function setupEmployeeDropdownChangeHandlers() {
    // Handle MDL dropdown changes for Department (add & edit)
    const selector = '[data-mdl-for="addDepartment"] .mdl-menu__item, [data-mdl-for="editDepartment"] .mdl-menu__item';
    $(document)
        .off('click.mdlDept', selector)
        .on('click.mdlDept', selector, function(e) {
            e.preventDefault();
            e.stopPropagation();
            const $li = $(this);
            const $ul = $li.closest('ul');
            const value = $li.data('val');
            const input = $('#' + $ul.attr('data-mdl-for'));
            input.val($li.text().trim());
            if (typeof value !== 'undefined') {
                input.attr('data-value', value);
            }
            const tf = input.closest('.mdl-textfield');
            if (tf && tf.length) tf.addClass('is-dirty');
        });
}

function setupModalHandlers() {
    // Add Employee button handler
    $(document).on('click', '#addEmployeeBtn', function() {
        $('#addEmployeeModal').modal('show');
    });
    
    // Photo preview handlers
    $(document).on('change', '#addPhoto', function() {
        handleFileUpload(this, '#addPhotoPreview', '#addPhotoPreviewContainer', '#addFileInfo', '#addFileName', '#addFileSize', '#addUploadError', '#addUploadErrorText', '#addFileUploadArea');
    });
    
    $(document).on('change', '#editPhoto', function() {
        handleFileUpload(this, '#editPhotoPreview', '#editPhotoPreviewContainer', '#editFileInfo', '#editFileName', '#editFileSize', '#editUploadError', '#editUploadErrorText', '#editFileUploadArea');
    });

    // Remove file handlers
    $(document).on('click', '#addRemoveFileBtn', function() {
        removeFile('#addPhoto', '#addPhotoPreview', '#addPhotoPreviewContainer', '#addFileInfo', '#addFileName', '#addFileSize', '#addUploadError', '#addUploadErrorText', '#addFileUploadArea');
    });

    $(document).on('click', '#editRemoveFileBtn', function() {
        removeFile('#editPhoto', '#editPhotoPreview', '#editPhotoPreviewContainer', '#editFileInfo', '#editFileName', '#editFileSize', '#editUploadError', '#editUploadErrorText', '#editFileUploadArea');
    });

    // Drag and drop handlers
    $(document).ready(function() {
        setupDragAndDrop('#addFileUploadArea', '#addPhoto');
        setupDragAndDrop('#editFileUploadArea', '#editPhoto');
    });

    // Initialize MDL components and ensure floating labels when modals are shown
    $('#addEmployeeModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }

            // Force labels to float for prefilled inputs
            const textfields = document.querySelectorAll('#addEmployeeModal .mdl-textfield');
            textfields.forEach(function(tf) {
                const input = tf.querySelector('.mdl-textfield__input');
                if (input && input.value) {
                    tf.classList.add('is-dirty');
                    tf.classList.remove('is-focused');
                }
            });

            setupEmployeeDropdownChangeHandlers();
            // Initialize date picker on show (in case of dynamic assets)
            initializeAddDatePicker();
        }, 200);
    });

    // Reset add modal when hidden
    $('#addEmployeeModal').on('hidden.bs.modal', function() {
        resetFileUploadInterface('#addPhotoPreview', '#addPhotoPreviewContainer', '#addFileInfo', '#addUploadError', '#addFileUploadArea');
    });

    $('#editEmployeeModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }

            const textfields = document.querySelectorAll('#editEmployeeModal .mdl-textfield');
            textfields.forEach(function(tf) {
                const input = tf.querySelector('.mdl-textfield__input');
                if (input && input.value) {
                    tf.classList.add('is-dirty');
                    tf.classList.remove('is-focused');
                }
            });

            // Ensure MDL select is marked dirty if it already has a value
            const deptInput = document.querySelector('#editDepartment');
            if (deptInput && (deptInput.getAttribute('data-value') || deptInput.value)) {
                const tf = deptInput.closest('.mdl-textfield');
                if (tf) tf.classList.add('is-dirty');
            }

            setupEmployeeDropdownChangeHandlers();
            // Initialize date picker/mask for edit
            initializeEditDatePicker();
        }, 200);
    });
}

// ========================================
// DATE PICKER (ADD EMPLOYEE)
// ========================================

function setupDatePickerForAdd() {
    // If using bootstrap-datepicker or flatpickr, hook here.
    initializeAddDatePicker();
}

function initializeAddDatePicker() {
    const $input = $('#addDateStarted');
    if (!$input.length) return;

    // Use native date if supported? We want custom text; fallback to simple mask.
    // If a plugin like flatpickr is available, use it.
    if (window.flatpickr) {
        if ($input[0]._flatpickr) return; // avoid re-init
        window.flatpickr($input[0], {
            dateFormat: 'Y-m-d',
            allowInput: true,
            clickOpens: true
        });
        return;
    }

    // Minimal input masking for MM/DD/YYYY
    $input.off('input.dateMask').on('input.dateMask', function() {
        let v = this.value.replace(/[^0-9]/g, '').slice(0, 8);
        if (v.length >= 5) v = v.replace(/(\d{4})(\d{2})(\d{0,2})/, '$1-$2-$3');
        else if (v.length >= 5) v = v.replace(/(\d{4})(\d{0,2})/, '$1-$2');
        this.value = v;
    });
}

function initializeEditDatePicker() {
    const $input = $('#editDateStarted');
    if (!$input.length) return;

    if (window.flatpickr) {
        if ($input[0]._flatpickr) return;
        window.flatpickr($input[0], {
            dateFormat: 'Y-m-d',
            allowInput: true,
            clickOpens: true
        });
        return;
    }

    // Minimal mask for YYYY-MM-DD
    $input.off('input.dateMask').on('input.dateMask', function() {
        let v = this.value.replace(/[^0-9]/g, '').slice(0, 8);
        if (v.length >= 7) v = v.replace(/(\d{4})(\d{2})(\d{0,2})/, '$1-$2-$3');
        else if (v.length >= 5) v = v.replace(/(\d{4})(\d{0,2})/, '$1-$2');
        this.value = v;
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
                        const employeeImage = `<img src="${photoUrl}" class="img-circle" width="50" height="50" alt="Employee Photo" style="object-fit: cover; cursor: pointer;" onclick="previewEmployeePhoto('${photoUrl}')" onerror="this.src='/img/employee/employee-default.png'">`;
                        
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
// PHOTO PREVIEW (TABLE)
// ========================================

function previewEmployeePhoto(imageUrl) {
    Swal.fire({
        imageUrl: imageUrl,
        imageAlt: 'Employee Photo',
        width: '80%',
        confirmButtonText: 'Close'
    });
}

function previewFullImage(imageUrl) {
    Swal.fire({
        imageUrl: imageUrl,
        imageAlt: 'Employee Photo',
        width: '80%',
        confirmButtonText: 'Close'
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
    formData.append('department', $('#addDepartment').attr('data-value') || $('#addDepartment').val());
    formData.append('contactNo', cleanedContact);
    formData.append('address', $('#addAddress').val());
    // Normalize date to YYYY-MM-DD if entered as MM/DD/YYYY
    formData.append('dateStarted', normalizeDateForSubmit($('#addDateStarted').val()));
    
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
                // Reset the form
                resetAddEmployeeForm();
                
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
    formData.append('department', $('#editDepartment').attr('data-value') || $('#editDepartment').val());
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

    // Store value for MDL select and force float labels
    $('#editDepartment').attr('data-value', employee.DEPARTMENT);
    ['#editFullName', '#editDepartment', '#editContactNo', '#editAddress', '#editDateStarted']
        .forEach(function(selector) {
            const input = document.querySelector(selector);
            if (input && (input.value || input.getAttribute('data-value'))) {
                const tf = input.closest('.mdl-textfield');
                if (tf) {
                    tf.classList.add('is-dirty');
                    tf.classList.remove('is-focused');
                }
            }
        });
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

// Convert MM/DD/YYYY to YYYY-MM-DD if needed
function normalizeDateForSubmit(value) {
    if (!value) return '';
    // If already in YYYY-MM-DD, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return value;
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
}

// ========================================
// FILE UPLOAD UTILITY FUNCTIONS
// ========================================

function handleFileUpload(input, previewSelector, previewContainerSelector, fileInfoSelector, fileNameSelector, fileSizeSelector, errorSelector, errorTextSelector, uploadAreaSelector) {
    const file = input.files[0];
    const maxSize = parseInt($(input).data('max-size')) || 5;
    $(errorSelector).hide();

    if (file) {
        if (!file.type.startsWith('image/')) {
            showUploadError(errorSelector, errorTextSelector, 'Please select a valid image file.');
            return;
        }
        if (file.size > maxSize * 1024 * 1024) {
            showUploadError(errorSelector, errorTextSelector, `File size must be less than ${maxSize}MB.`);
            return;
        }
        $(fileNameSelector).text(file.name);
        $(fileSizeSelector).text(formatFileSize(file.size));
        $(fileInfoSelector).show();
        $(uploadAreaSelector).addClass('has-file');

        const reader = new FileReader();
        reader.onload = function(e) {
            $(previewSelector).attr('src', e.target.result);
            $(previewContainerSelector).show();
        };
        reader.readAsDataURL(file);
    }
}

function removeFile(inputSelector, previewSelector, previewContainerSelector, fileInfoSelector, fileNameSelector, fileSizeSelector, errorSelector, errorTextSelector, uploadAreaSelector) {
    $(inputSelector).val('');
    $(previewSelector).attr('src', '');
    $(previewContainerSelector).hide();
    $(fileInfoSelector).hide();
    $(fileNameSelector).text('');
    $(fileSizeSelector).text('');
    $(errorSelector).hide();
    $(uploadAreaSelector).removeClass('has-file');
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
    const $uploadArea = $(uploadAreaSelector);
    const $input = $(inputSelector);

    $uploadArea.off('dragover dragenter drop dragleave')
        .on('dragover dragenter', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).addClass('dragover');
        })
        .on('dragleave drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).removeClass('dragover');
            
            if (e.type === 'drop') {
                const files = e.originalEvent.dataTransfer.files;
                if (files.length > 0) {
                    $input[0].files = files;
                    $input.trigger('change');
                }
            }
        });
}

function resetFileUploadInterface(previewSelector, previewContainerSelector, fileInfoSelector, errorSelector, uploadAreaSelector) {
    $(previewSelector).attr('src', '');
    $(previewContainerSelector).hide();
    $(fileInfoSelector).hide();
    $(errorSelector).hide();
    $(uploadAreaSelector).removeClass('has-file');
}

// ========================================
// FORM RESET FUNCTIONS
// ========================================

function resetAddEmployeeForm() {
    // Reset all form inputs
    $('#addFullName').val('');
    $('#addDepartment').val('');
    $('#addDepartment').attr('data-value', '');
    $('#addContactNo').val('');
    $('#addAddress').val('');
    $('#addDateStarted').val('');
    
    // Reset photo upload interface
    resetFileUploadInterface('#addPhotoPreview', '#addPhotoPreviewContainer', '#addFileInfo', '#addUploadError', '#addFileUploadArea');
    
    // Reset MDL textfield states
    const textfields = document.querySelectorAll('#addEmployeeModal .mdl-textfield');
    textfields.forEach(function(tf) {
        tf.classList.remove('is-dirty');
        tf.classList.remove('is-focused');
    });
    
    // Reset the form element
    $('#addEmployeeForm')[0].reset();
}