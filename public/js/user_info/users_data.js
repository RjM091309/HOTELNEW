// ========================================
// USER INFO MANAGEMENT - MAIN JAVASCRIPT
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
                        
                        // Create status badge
                        const status = user.ACTIVE === 1
                            ? '<span class="badge badge-success">Active</span>'
                            : '<span class="badge badge-danger">Inactive</span>';
                        
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
    const fullname = $('#fullname').val();
    const username = $('#username').val();
    const role = $('#role').val();
    const password = $('#password').val();
    const confirm_password = $('#confirm_password').val();
    
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
    const fullname = $('#editFullname').val();
    const username = $('#editUsername').val();
    const role = $('#editRole').val();
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
    $('#editFullname').val(user.FULLNAME);
    $('#editUsername').val(user.USERNAME);
    $('#editRole').val(user.PERMISSIONS);
    $('#editPassword').val('');
    $('#editConfirmPassword').val('');
    $('#editUsernameCheck').html('');
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
    $('#username').on('input', function() {
        checkUsernameAvailability($(this).val(), 'usernameCheck');
    });

    $('#editUsername').on('input', function() {
        checkUsernameAvailability($(this).val(), 'editUsernameCheck');
    });
}); 