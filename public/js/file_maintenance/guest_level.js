$(document).ready(function() {
    // Initialize DataTable
    var guestLevelTable = $('#guestLevelTable').DataTable({
        "pageLength": 10,
        "order": [[0, "asc"]],
        "columnDefs": [
            { targets: [1, 2], className: "text-center" , width: '10%' },
            { "orderable": false, "targets": [2] }
        ]
    });

    // Load initial data from server
    function loadGuestLevels() {
        $.ajax({
            url: '/guest/guest_level/get-all',
            type: 'GET',
            success: function (response) {
                if (response.success && response.data) {
                    // Clear existing data
                    guestLevelTable.clear();
                    
                    // Add each guest level to the table
                    response.data.forEach(function(guestLevel) {
                        var statusButton = guestLevel.ACTIVE === 1 
                            ? '<button class="btn label-success btn-xs toggle-status" onclick="toggleGuestLevelStatus(event, \'' + guestLevel.IDNo + '\', 0)" style="color: white;">ACTIVE</button>'
                            : '<button class="btn label-danger btn-xs toggle-status" onclick="toggleGuestLevelStatus(event, \'' + guestLevel.IDNo + '\', 1)" style="color: white;">INACTIVE</button>';
                        
                        var actionButtons = '<button class="btn btn-tbl-edit btn-xs" onclick="editGuestLevel(\'' + guestLevel.IDNo + '\')" title="Edit Guest Level" style="margin-right: 5px;"><i class="fa fa-pencil"></i></button>' +
                                          '<button class="btn btn-tbl-delete btn-xs" onclick="deleteGuestLevel(\'' + guestLevel.IDNo + '\')" title="Delete Guest Level"><i class="fa fa-trash-o"></i></button>';
                        
                        guestLevelTable.row.add([
                            '<div>' + guestLevel.TYPE + '</div>',
                            '<div>' + statusButton + '</div>',
                            '<div>' + actionButtons + '</div>'
                        ]);
                    });
                    
                    // Draw the table
                    guestLevelTable.draw();
                }
            },
            error: function () {
                console.error('Failed to load guest levels');
            }
        });
    }

    // Load initial data
    loadGuestLevels();

    $('#add_guestLevel_form').submit(function (event) {
        event.preventDefault(); // Prevent default form submission
        const levelName = $('#txtLevelName').val().trim();

        if (!levelName) {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: 'Guest Level is required!',
            });
            return;
        }

        $.ajax({
            url: '/guest/guest_level/add',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ TYPE: levelName }),
            success: function (response) {
                if (response.success) {
                    $('#add-guestLevel-modal').modal('hide');
                    
                    // Clear the form
                    $('#txtLevelName').val('');
                    
                    // Add new row to DataTable
                    var newRow = guestLevelTable.row.add([
                        '<div class="text-center">' + levelName + '</div>',
                        '<div class="text-center"><button class="btn label-success btn-xs toggle-status" onclick="toggleGuestLevelStatus(event, \'' + response.data.IDNo + '\', 0)" style="color: white;">ACTIVE</button></div>',
                        '<div class="text-center"><button class="btn btn-tbl-edit btn-xs" onclick="editGuestLevel(\'' + response.data.IDNo + '\')" title="Edit Guest Level" style="margin-right: 5px;"><i class="fa fa-pencil"></i></button><button class="btn btn-tbl-delete btn-xs" onclick="deleteGuestLevel(\'' + response.data.IDNo + '\')" title="Delete Guest Level"><i class="fa fa-trash-o"></i></button></div>'
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
                        text: 'Guest Level added successfully!',
                        confirmButtonText: 'OK',
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to add Guest Level.',
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

    window.editGuestLevel = function(id) {
        $.ajax({
            url: `/guest/guest_level/get/${id}`,
            type: 'GET',
            success: function (response) {
                if (response.success) {
                    $('#editGuestLevelID').val(response.data.IDNo);
                    $('#editGuestLevelName').val(response.data.TYPE);
                    $('#edit-guestLevel-modal').modal('show');
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to fetch Guest Level details.',
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

    $('#edit_guestLevel_form').submit(function (event) {
        event.preventDefault(); // Prevent default form submission

        const id = $('#editGuestLevelID').val();
        const level = $('#editGuestLevelName').val().trim();

        if (!level) {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: 'Guest Level is required!',
            });
            return;
        }

        // Send AJAX request to update Guest Level
        $.ajax({
            url: `/guest/guest_level/edit/${id}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ TYPE: level }),
            success: function (response) {
                if (response.success) {
                    $('#edit-guestLevel-modal').modal('hide');
                    
                    // Update the row in DataTable
                    var row = guestLevelTable.row(function(idx, data, node) {
                        return data[0] === response.data.TYPE || 
                               $(node).find('button[onclick*="' + id + '"]').length > 0;
                    });
                    
                    if (row.length > 0) {
                        var rowData = row.data();
                        rowData[0] = '<div class="text-center">' + level + '</div>'; // Update the level name with center alignment
                        row.draw();
                    }

                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Guest Level updated successfully!',
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: response.message || 'Failed to update Guest Level.',
                    });
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.error('AJAX Error:', textStatus, errorThrown); // Log error details
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An unexpected error occurred.',
                });
            },
        });
    });

    window.toggleGuestLevelStatus = function(event, id, newStatus) {
        event.preventDefault();

        $.ajax({
            url: `/guest/guest_level/toggle/${id}`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ ACTIVE: newStatus }),
            success: function (response) {
                if (response.success) {
                    const button = $(event.target);
                    if (newStatus === 1) {
                        button.removeClass('label-danger').addClass('label-success').text('ACTIVE').css('color', 'white');
                        button.attr('onclick', `toggleGuestLevelStatus(event, '${id}', 0)`);
                    } else {
                        button.removeClass('label-success').addClass('label-danger').text('INACTIVE').css('color', 'white');
                        button.attr('onclick', `toggleGuestLevelStatus(event, '${id}', 1)`);
                    }

                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Status updated successfully!',
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

    window.deleteGuestLevel = function(id) {
        Swal.fire({
            title: 'Are you sure?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it!',
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: `/guest/guest_level/delete/${id}`,
                    type: 'DELETE',
                    success: function (response) {
                        if (response.success) {
                            // Remove the row from DataTable
                            var row = guestLevelTable.row(function(idx, data, node) {
                                return $(node).find('button[onclick*="' + id + '"]').length > 0;
                            });
                            
                            if (row.length > 0) {
                                row.remove().draw();
                            }

                            Swal.fire({
                                icon: 'success',
                                title: 'Deleted!',
                                text: 'Guest Level has been deleted.',
                            });
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'Error',
                                text: response.message || 'Failed to delete Guest Level.',
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