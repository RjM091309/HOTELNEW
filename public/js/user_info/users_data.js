// ========================================
// USER INFO MANAGEMENT - MAIN JAVASCRIPT
// ========================================

var dataTable;

// Role ID to display name mapping for consistent UI rendering
const ROLE_ID_TO_NAME = {
    '1': 'Admin',
    '2': 'Frontdesk',
    '3': 'Manager',
    '4': 'Housekeeping',
    '5': 'GuestRoom',
    '6': 'GuestApp',
    '7': 'DriverApp',
    '8': 'SalesRoom'
};

function getRoleNameById(roleId) {
    return ROLE_ID_TO_NAME[String(roleId)] || 'Unknown';
}

// ========================================
// STATUS LABEL FUNCTIONS
// ========================================

// Get label class based on user status (matching payment status design)
function getUserStatusLabel(isActive) {
    return isActive === 1 ? 'label-success' : 'label-danger';
}

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
    $('#addUserForm').on('submit', function(e) {
        e.preventDefault();
        createUser();
    });
    
    $('#editUserForm').on('submit', function(e) {
        e.preventDefault();
        updateUser();
    });
}

function setupModalHandlers() {
    // Add User button handler
    $(document).on('click', '#addUserBtn', function() {
        $('#addUserModal').modal('show');
    });

    // Initialize MDL components when modals are shown
    $('#addUserModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Enforce clearing values and disabling autofill artifacts
            resetAddUserForm();
            const addForm = document.getElementById('addUserForm');
            if (addForm) {
                addForm.setAttribute('autocomplete', 'off');
            }
            $('#addUsername').attr({
                'autocomplete': 'off',
                'autocapitalize': 'none',
                'spellcheck': 'false',
                'name': 'new-username'
            });
            $('#addPassword, #addConfirmPassword').attr({
                'autocomplete': 'new-password',
                'name': function(idx, old){ return old === 'password' ? 'new-password' : 'confirm-new-password'; }
            });
        }, 200);
    });

    // Reset add modal when hidden
    $('#addUserModal').on('hidden.bs.modal', function() {
        resetAddUserForm();
    });

    $('#editUserModal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            // Ensure Role text shows name, not id, when opening
            const currentVal = $('#editRole').attr('data-value');
            if (currentVal) {
                $('#editRole').val(getRoleNameById(currentVal));
                $('#editRole').closest('.mdl-textfield').addClass('is-dirty');
            }
        }, 200);
    });

    // Setup MDL dropdown handlers
    setupUserDropdownChangeHandlers();
}

// ========================================
// DATATABLE CONFIGURATION
// ========================================

function initializeDataTable() {
    if ($.fn.DataTable.isDataTable('#usersTable')) {
        $('#usersTable').DataTable().destroy();
    }

    dataTable = $("#usersTable").DataTable({
        columnDefs: [
            { targets: [4], className: "text-center" },
            { targets: [4], orderable: false, searchable: false }
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
        url: '/user_info/api/users',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                dataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(user) {
                        const actions = `
                            <button type="button" class="btn btn-tbl-edit btn-xs" onclick="editUser('${user.IDno}')" title="Edit User">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteUser('${user.IDno}')" title="Delete User">
                                <i class="fa fa-trash"></i>
                            </button>
                        `;
                        
                        // Create role display
                        const roles = {
                            1: 'Admin',
                            2: 'Frontdesk',
                            3: 'Manager',
                            4: 'Housekeeping',
                            5: 'GuestRoom',
                            6: 'GuestApp',
                            7: 'DriverApp',
                            8: 'SalesRoom'
                        };
                        const roleDisplay = roles[user.PERMISSIONS] || 'Unknown';
                        
                        // Create status label (matching payment status design)
                        const status = `<span class="label label-sm ${getUserStatusLabel(user.ACTIVE)}">
                            ${user.ACTIVE === 1 ? 'Active' : 'Inactive'}
                        </span>`;
                        
                        dataTable.row.add([
                            user.FULLNAME || '',
                            user.USERNAME || '',
                            roleDisplay,
                            status,
                            actions
                        ]);
                    });
                    dataTable.draw();
                }
            } else {
                console.error('Error loading users data:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading users data',
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
                text: 'Failed to load users data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

// ========================================
// USERS CRUD OPERATIONS
// ========================================

function createUser() {
    // Validate required fields
    const fullname = $('#addFullName').val();
    const username = $('#addUsername').val();
    const role = $('#addRole').attr('data-value') || $('#addRole').val();
    const password = $('#addPassword').val();
    const confirm_password = $('#addConfirmPassword').val();
    
    if (!fullname || !username || !role || !password || !confirm_password) {
        Swal.fire({
            title: 'Missing Required Fields!',
            text: 'Please fill in all required fields.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Check if passwords match
    if (password !== confirm_password) {
        Swal.fire({
            title: 'Password Mismatch!',
            text: 'Passwords do not match.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Check username availability
    if ($('#usernameCheck').find('.text-danger').length > 0) {
        Swal.fire({
            title: 'Username Already Taken!',
            text: 'Please choose a different username.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    const formData = {
        fullname: fullname,
        username: username,
        role: role,
        password: password,
        confirm_password: confirm_password
    };
    
    $.ajax({
        url: '/user_info/api/users/create',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                // Reset form before closing modal
                resetAddUserForm();
                $('#addUserModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'User created successfully',
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
                    text: 'Error creating user: ' + response.message,
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
                text: 'Error creating user. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function updateUser() {
    // Validate required fields
    const userId = $('#editUserId').val();
    const fullname = $('#editFullName').val();
    const username = $('#editUsername').val();
    const role = $('#editRole').attr('data-value') || $('#editRole').val();
    const password = $('#editPassword').val();
    const confirm_password = $('#editConfirmPassword').val();
    
    if (!userId || !fullname || !username || !role) {
        Swal.fire({
            title: 'Missing Required Fields!',
            text: 'Please fill in all required fields.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Check if passwords match if password is provided
    if (password && password !== confirm_password) {
        Swal.fire({
            title: 'Password Mismatch!',
            text: 'Passwords do not match.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    // Check username availability if changed
    if ($('#editUsernameCheck').find('.text-danger').length > 0) {
        Swal.fire({
            title: 'Username Already Taken!',
            text: 'Please choose a different username.',
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    const formData = {
        userId: userId,
        fullname: fullname,
        username: username,
        role: role,
        password: password,
        confirm_password: confirm_password
    };
    
    $.ajax({
        url: '/user_info/api/users/update',
        method: 'POST',
        data: JSON.stringify(formData),
        contentType: 'application/json',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                $('#editUserModal').modal('hide');
                
                setTimeout(() => {
                    Swal.fire({
                        title: 'Success!',
                        text: 'User updated successfully',
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
                    text: 'Error updating user: ' + response.message,
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
                text: 'Error updating user. Please try again.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        }
    });
}

function editUser(userId) {
    $.ajax({
        url: `/user_info/api/users/${userId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditForm(response.data);
                $('#editUserModal').modal('show');
            } else {
                console.error('Error loading user details:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading user details',
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
                text: 'Failed to load user details',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
    });
}

function deleteUser(userId) {
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
                url: `/user_info/api/users/${userId}`,
                method: 'DELETE',
                dataType: 'json',
                success: function(response) {
                    if (response.success) {
                        Swal.fire(
                            'Deleted!',
                            'User has been deleted successfully.',
                            'success'
                        ).then(() => {
                            reloadData();
                        });
                    } else {
                        Swal.fire(
                            'Error!',
                            'Error deleting user: ' + response.message,
                            'error'
                        );
                    }
                },
                error: function(xhr, status, error) {
                    console.error('AJAX Error:', error);
                    Swal.fire(
                        'Error!',
                        'Error deleting user',
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

function populateEditForm(user) {
    $('#editUserId').val(user.IDno);
    $('#editFullName').val(user.FULLNAME);
    $('#editUsername').val(user.USERNAME);
    const roleName = getRoleNameById(user.PERMISSIONS);
    $('#editRole').val(roleName);
    $('#editRole').attr('data-value', user.PERMISSIONS);
    $('#editPassword').val('');
    $('#editConfirmPassword').val('');
    $('#editUsernameCheck').html('');
    
    // Force MDL labels to float for prefilled inputs
    const textfields = document.querySelectorAll('#editUserModal .mdl-textfield');
    textfields.forEach(function(tf) {
        const input = tf.querySelector('.mdl-textfield__input');
        if (input && input.value) {
            tf.classList.add('is-dirty');
            tf.classList.remove('is-focused');
        }
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Username availability check
function checkUsernameAvailability(username, elementId) {
    if (!username) {
        $(`#${elementId}`).html('');
        return;
    }

    $.ajax({
        url: '/user_info/api/users/check-username',
        method: 'POST',
        data: JSON.stringify({ username: username }),
        contentType: 'application/json',
        success: function(response) {
            if (response.success) {
                if (response.available) {
                    $(`#${elementId}`).html('<span class="text-success">✓ Username available</span>');
                } else {
                    $(`#${elementId}`).html('<span class="text-danger">✗ Username already taken</span>');
                }
            }
        },
        error: function() {
            $(`#${elementId}`).html('<span class="text-warning">⚠ Unable to check availability</span>');
        }
    });
}

// Initialize username check listeners
$(document).ready(function() {
    $('#addUsername').on('input', function() {
        checkUsernameAvailability($(this).val(), 'usernameCheck');
    });

    $('#editUsername').on('input', function() {
        checkUsernameAvailability($(this).val(), 'editUsernameCheck');
    });
});

// ========================================
// FORM RESET UTILITIES
// ========================================

function resetAddUserForm() {
    // Clear values
    $('#addFullName').val('');
    $('#addUsername').val('');
    $('#addRole').val('').attr('data-value', '');
    $('#addPassword').val('');
    $('#addConfirmPassword').val('');
    $('#usernameCheck').html('');

    // Reset MDL textfields state
    const textfields = document.querySelectorAll('#addUserModal .mdl-textfield');
    textfields.forEach(function(tf) {
        tf.classList.remove('is-dirty');
        tf.classList.remove('is-focused');
    });

    // Reset the native form
    if (document.getElementById('addUserForm')) {
        document.getElementById('addUserForm').reset();
    }
}

// ========================================
// MDL DROPDOWN HANDLERS FOR USER
// ========================================

function setupUserDropdownChangeHandlers() {
    // Handle MDL dropdown changes for Role (add & edit)
    const selector = '[data-mdl-for="addRole"] .mdl-menu__item, [data-mdl-for="editRole"] .mdl-menu__item';
    $(document)
        .off('click.mdlRole', selector)
        .on('click.mdlRole', selector, function(e) {
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