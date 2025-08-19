$(document).ready(function() {
    // Initialize DataTable
    var guestTypeTable = $('#guestTypeTable').DataTable({
        "pageLength": 15,
        "order": [[0, "asc"]],
        "columnDefs": [
            { targets: [1, 2], className: "text-center" , width: '10%' },
            { "orderable": false, "targets": [2] }
        ]
    });

    // Load initial data from server
    function loadGuestTypes() {
        $.ajax({
            url: '/guest/guest_type/get-all',
            type: 'GET',
            success: function (response) {
                if (response.success && response.data) {
                    // Clear existing data
                    guestTypeTable.clear();
                    
                    // Add each guest type to the table
                    response.data.forEach(function(guestType) {
                        var statusButton = guestType.ACTIVE === 1 
                            ? '<button class="btn label-success btn-xs toggle-status" onclick="toggleGuestTypeStatus(event, \'' + guestType.IDNo + '\', 0)" style="color: white;">ACTIVE</button>'
                            : '<button class="btn label-danger btn-xs toggle-status" onclick="toggleGuestTypeStatus(event, \'' + guestType.IDNo + '\', 1)" style="color: white;">INACTIVE</button>';
                        
                        var actionButtons = '<button class="btn btn-tbl-edit btn-xs" onclick="editGuestType(\'' + guestType.IDNo + '\')" title="Edit Guest Type" style="margin-right: 5px;"><i class="fa fa-pencil"></i></button>' +
                                          '<button class="btn btn-tbl-delete btn-xs delete-link" onclick="deleteGuestType(\'' + guestType.IDNo + '\')" title="Delete Guest Type"><i class="fa fa-trash-o"></i></button>';
                        
                        guestTypeTable.row.add([
                            '<div>' + guestType.TYPE + '</div>',
                            '<div>' + statusButton + '</div>',
                            '<div>' + actionButtons + '</div>'
                        ]);
                    });
                    
                    // Draw the table
                    guestTypeTable.draw();
                }
            },
            error: function () {
                console.error('Failed to load guest types');
            }
        });
    }

    // Load initial data
    loadGuestTypes();

    // Handle the form submission
    $('#add_guestType_form').submit(function (event) {
        event.preventDefault(); // Prevent the default form submission

        const txtTypeGuest = $('#txtTypeGuest').val().trim();

        if (!txtTypeGuest) {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: 'Guest Type is required!',
            });
            return;
        }

        // Send AJAX request to the server
        $.ajax({
            url: '/guest/guest_type/add',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ txtTypeGuest }),
            success: function (response) {
                console.log('Server Response:', response); // Debug: Log the server response
                if (response.success) {
                    $('#add-guestType-modal').modal('hide'); // Close the modal
                    
                    // Clear the form
                    $('#txtTypeGuest').val('');
                    
                    // Add new row to DataTable
                    var newRow = guestTypeTable.row.add([
                        '<div class="text-center">' + txtTypeGuest + '</div>',
                        '<div class="text-center"><button class="btn label-success btn-xs toggle-status" onclick="toggleGuestTypeStatus(event, \'' + response.data.IDNo + '\', 0)" style="color: white;">ACTIVE</button></div>',
                        '<div class="text-center"><button class="btn btn-tbl-edit btn-xs" onclick="editGuestType(\'' + response.data.IDNo + '\')" title="Edit Guest Type" style="margin-right: 5px;"><i class="fa fa-pencil"></i></button><button class="btn btn-tbl-delete btn-xs delete-link" onclick="deleteGuestType(\'' + response.data.IDNo + '\')" title="Delete Guest Type"><i class="fa fa-trash-o"></i></button></div>'
                    ]).draw();
                    
                    // Highlight the new row
                    var rowNode = newRow.node();
                    $(rowNode).addClass('highlight');
                    setTimeout(function() {
                        $(rowNode).removeClass('highlight');
                    }, 2000);

                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Guest Type added successfully!',
                        confirmButtonText: 'OK',
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to add Guest Type.',
                    });
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.error('AJAX Error:', textStatus, errorThrown); // Debug: Log AJAX error
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An unexpected error occurred.',
                });
            },
        });
    });

    //EDIT
    // Show the Edit Modal with pre-filled values
    window.editGuestType = function(id) {
        // Fetch guest type details using AJAX
        $.ajax({
            url: `/guest/guest_type/get/${id}`,
            type: 'GET',
            success: function (response) {
                if (response.success) {
                    // Pre-fill the form inputs
                    $('#editGuestTypeID').val(response.data.IDNo);
                    $('#editGuestTypeName').val(response.data.TYPE);

                    // Show the modal
                    $('#edit-guestType-modal').modal('show');
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to fetch Guest Type details.',
                    });
                }
            },
            error: function () {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An unexpected error occurred.',
                });
            },
        });
    }

    // Handle the form submission for editing
    $('#edit_guestType_form').submit(function (event) {
        event.preventDefault(); // Prevent the default form submission

        const id = $('#editGuestTypeID').val();
        const type = $('#editGuestTypeName').val().trim();

        if (!type) {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: 'Guest Type is required!',
            });
            return;
        }

        // Send AJAX request to update the guest type
        $.ajax({
            url: `/guest/guest_type/edit/${id}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ TYPE: type }),
            success: function (response) {
                if (response.success) {
                    $('#edit-guestType-modal').modal('hide'); // Close the modal
                    
                    // Update the row in DataTable
                    var row = guestTypeTable.row(function(idx, data, node) {
                        return data[0] === response.data.TYPE || 
                               $(node).find('button[onclick*="' + id + '"]').length > 0;
                    });
                    
                    if (row.length > 0) {
                        var rowData = row.data();
                        rowData[0] = '<div class="text-center">' + type + '</div>'; // Update the type name with center alignment
                        row.draw();
                    }

                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Guest Type updated successfully!',
                        confirmButtonText: 'OK',
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to update Guest Type.',
                    });
                }
            },
            error: function () {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An unexpected error occurred.',
                });
            },
        });
    });

    window.toggleGuestTypeStatus = function(event, id, newStatus) {
        event.preventDefault(); // Prevent default button behavior

        // Send AJAX request to toggle status
        $.ajax({
            url: `/guest/guest_type/toggle/${id}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ ACTIVE: newStatus }),
            success: function (response) {
                if (response.success) {
                    // Update the button dynamically
                    const button = $(event.target); // Get the clicked button
                    if (newStatus === 1) {
                        // Change to ACTIVE
                        button.removeClass('label-danger').addClass('label-success').text('ACTIVE').css('color', 'white');
                        button.attr('onclick', `toggleGuestTypeStatus(event, '${id}', 0)`);
                    } else {
                        // Change to INACTIVE
                        button.removeClass('label-success').addClass('label-danger').text('INACTIVE').css('color', 'white');
                        button.attr('onclick', `toggleGuestTypeStatus(event, '${id}', 1)`);
                    }

                    // Show success alert
                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Status updated successfully!',
                        confirmButtonText: 'OK',
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to update status.',
                    });
                }
            },
            error: function () {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An unexpected error occurred.',
                });
            },
        });
    }

    //DELETE
    window.deleteGuestType = function(id) {
        // Show a confirmation dialog
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
                // Send AJAX request to delete the guest type
                $.ajax({
                    url: `/guest/guest_type/delete/${id}`,
                    type: 'DELETE',
                    success: function (response) {
                        if (response.success) {
                            // Remove the row from DataTable
                            var row = guestTypeTable.row(function(idx, data, node) {
                                return $(node).find('button[onclick*="' + id + '"]').length > 0;
                            });
                            
                            if (row.length > 0) {
                                row.remove().draw();
                            }

                            Swal.fire({
                                icon: 'success',
                                title: 'Deleted!',
                                text: 'Guest Type has been deleted.',
                                confirmButtonText: 'OK',
                            });
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'Error',
                                text: response.message || 'Failed to delete Guest Type.',
                            });
                        }
                    },
                    error: function () {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'An unexpected error occurred.',
                        });
                    },
                });
            }
        });
    }
}); 