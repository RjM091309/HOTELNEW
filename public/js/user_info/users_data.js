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
    '8': 'SalesRoom',
    '9': 'Guest Room Controller'
};

function getRoleNameById(roleId) {
    return ROLE_ID_TO_NAME[String(roleId)] || 'Unknown';
}

// ========================================
// INITIALIZATION
// ========================================

$(document).ready(function() {
    initializeDataTable();
    setupFormHandlers();
    setupModalHandlers();
    
    // Check if current user is admin to show/hide room users button
    checkUserPermissions();
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

    // Room Users button handler
    $(document).on('click', '#viewRoomUsersBtn', function() {
        $('#roomUsersModal').modal('show');
        loadRoomUsersData();
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
            // Initialize room list if needed
            ensureRoomsLoaded().then(() => handleRoleDependentFields('add'));
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
            ensureRoomsLoaded().then(() => handleRoleDependentFields('edit'));
        }, 200);
    });

    // Setup MDL dropdown handlers
    setupUserDropdownChangeHandlers();
    setupRoomDropdownHandlers();
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
                        // Filter out users with ROOM_ID (only show them in room users modal)
                        if (user.ROOM_ID) {
                            return; // Skip this user in main table
                        }

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
                            8: 'SalesRoom',
                            9: 'Guest Room Controller'
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
        roomId: (String(role) === '9') ? ($('#addRoom').attr('data-value') || '') : '',
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
        roomId: (String(role) === '9') ? ($('#editRoom').attr('data-value') || '') : '',
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
    if (String(user.PERMISSIONS) === '9' && user.ROOM_ID) {
        ensureRoomsLoaded().then(function(){
            const room = (cachedRooms||[]).find(function(r){ return String(r.IDNo) === String(user.ROOM_ID); });
            if (room) {
                $('#editRoom').val(room.ROOM_NUMBER).attr('data-value', room.IDNo);
                $('#editRoomContainer').show();
                $('#editRoom').closest('.mdl-textfield').addClass('is-dirty');
            }
        });
    } else {
        $('#editRoomContainer').hide();
        $('#editRoom').val('').attr('data-value','');
    }
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

            // Toggle room selector visibility based on role
            handleRoleDependentFields(input.is('#addRole') ? 'add' : 'edit');
        });
} 

// ========================================
// ROOM SELECTORS FOR GUEST ROOM CONTROLLER
// ========================================

let cachedRooms = null;

function ensureRoomsLoaded() {
    if (cachedRooms) return Promise.resolve(cachedRooms);
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: '/room/api/rooms',
            method: 'GET',
            dataType: 'json',
            success: function(resp) {
                if (resp && resp.success && Array.isArray(resp.data)) {
                    cachedRooms = resp.data
                        .filter(function(r){ return r.ACTIVE === 1; })
                        .sort(function(a,b){ 
                            const aNum = String(a.ROOM_NUMBER || '');
                            const bNum = String(b.ROOM_NUMBER || '');
                            return aNum.localeCompare(bNum, undefined, {numeric: true, sensitivity: 'base'});
                        });
                    populateRoomLists();
                    resolve(cachedRooms);
                } else {
                    resolve([]);
                }
            },
            error: function(){ resolve([]); }
        });
    });
}

function populateRoomLists() {
    var addUl = document.getElementById('addRoomList');
    var editUl = document.getElementById('editRoomList');
    if (!addUl || !editUl) return;
    addUl.innerHTML = '';
    editUl.innerHTML = '';
    (cachedRooms || []).forEach(function(room){
        var li1 = document.createElement('li');
        li1.className = 'mdl-menu__item';
        li1.setAttribute('data-val', room.IDNo);
        li1.textContent = room.ROOM_NUMBER;
        addUl.appendChild(li1);

        var li2 = document.createElement('li');
        li2.className = 'mdl-menu__item';
        li2.setAttribute('data-val', room.IDNo);
        li2.textContent = room.ROOM_NUMBER;
        editUl.appendChild(li2);
    });
}

function setupRoomDropdownHandlers() {
    const selector = '[data-mdl-for="addRoom"] .mdl-menu__item, [data-mdl-for="editRoom"] .mdl-menu__item';
    $(document)
        .off('click.mdlRoom', selector)
        .on('click.mdlRoom', selector, function(e){
            e.preventDefault();
            e.stopPropagation();
            const $li = $(this);
            const $ul = $li.closest('ul');
            const value = $li.data('val');
            const input = $('#' + $ul.attr('data-mdl-for'));
            input.val($li.text().trim());
            if (typeof value !== 'undefined') input.attr('data-value', value);
            const tf = input.closest('.mdl-textfield');
            if (tf && tf.length) tf.addClass('is-dirty');
        });
}

function handleRoleDependentFields(mode) {
    const roleInput = mode === 'add' ? $('#addRole') : $('#editRole');
    const roomContainer = mode === 'add' ? $('#addRoomContainer') : $('#editRoomContainer');
    const roomInput = mode === 'add' ? $('#addRoom') : $('#editRoom');
    const roleVal = roleInput.attr('data-value') || roleInput.val();
    if (String(roleVal) === '9') {
        roomContainer.show();
        if (roomInput.val()) {
            roomInput.closest('.mdl-textfield').addClass('is-dirty');
        }
    } else {
        roomContainer.hide();
        roomInput.val('').attr('data-value','');
        roomInput.closest('.mdl-textfield').removeClass('is-dirty');
    }
}

// ========================================
// ROOM USERS TABLE FUNCTIONS
// ========================================

let roomUsersDataTable;

function loadRoomUsersData() {
    // Initialize room users table if not already done
    if (!roomUsersDataTable) {
        initializeRoomUsersTable();
    }
    
    // Ensure rooms are loaded before fetching user data
    ensureRoomsLoaded().then(() => {
        $.ajax({
            url: '/user_info/api/users',
            method: 'GET',
            dataType: 'json',
            success: function(response) {
            if (response.success) {
                roomUsersDataTable.clear();
                
                if (response.data && response.data.length > 0) {
                    response.data.forEach(function(user) {
                        // Only show users with ROOM_ID
                        if (!user.ROOM_ID) {
                            return; // Skip users without room assignment
                        }

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
                            8: 'SalesRoom',
                            9: 'Guest Room Controller'
                        };
                        const roleDisplay = roles[user.PERMISSIONS] || 'Unknown';
                        
                                                 // Get room number from cached rooms
                         let roomNumber = 'Unknown';
                         if (cachedRooms && user.ROOM_ID) {
                             const room = cachedRooms.find(r => String(r.IDNo) === String(user.ROOM_ID));
                             if (room) {
                                 roomNumber = room.ROOM_NUMBER;
                             } else {
                                 roomNumber = `Room ID: ${user.ROOM_ID}`;
                             }
                         }
                        
                        // Create status badge
                        const status = user.ACTIVE === 1
                            ? '<span class="badge badge-success">Active</span>'
                            : '<span class="badge badge-danger">Inactive</span>';
                        
                        roomUsersDataTable.row.add([
                            user.FULLNAME || '',
                            user.USERNAME || '',
                            roleDisplay,
                            roomNumber,
                            status,
                            actions
                        ]);
                    });
                    roomUsersDataTable.draw();
                }
            } else {
                console.error('Error loading room users data:', response.message);
                Swal.fire({
                    title: 'Error!',
                    text: 'Error loading room users data',
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
                text: 'Failed to load room users data',
                icon: 'error',
                confirmButtonColor: '#d33',
                confirmButtonText: 'OK'
            });
        }
        });
    });
}

function initializeRoomUsersTable() {
    if ($.fn.DataTable.isDataTable('#roomUsersTable')) {
        $('#roomUsersTable').DataTable().destroy();
    }

    roomUsersDataTable = $("#roomUsersTable").DataTable({
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
}

// ========================================
// PERMISSION CHECKING
// ========================================

function checkUserPermissions() {
    // Check if current user is admin (role 1) to show room users button
    // This is a simple check - you might want to implement proper session checking
    $.ajax({
        url: '/user_info/api/current-user',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success && response.data && response.data.PERMISSIONS === 1) {
                $('#viewRoomUsersBtn').show();
            } else {
                $('#viewRoomUsersBtn').hide();
            }
        },
        error: function() {
            // If we can't check permissions, hide the button for security
            $('#viewRoomUsersBtn').hide();
        }
    });
}