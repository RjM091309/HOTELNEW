// ========================================
// INTEGRATION DATA MANAGEMENT
// ========================================

var dataTable;

// ========================================
// INITIALIZATION
// ========================================

$(document).ready(function() {
    initializeDataTable();
});



// ========================================
// DATATABLE CONFIGURATION
// ========================================

function initializeDataTable() {
    if ($.fn.DataTable.isDataTable('#integrationTable')) {
        $('#integrationTable').DataTable().destroy();
    }

    dataTable = $("#integrationTable").DataTable({
        columnDefs: [{ targets: [3], orderable: false, searchable: false }],
        pageLength: 10,
        searching: true,
        ordering: true,
        responsive: true
    });
    
    reloadData();
}



// ========================================
// DATA OPERATIONS
// ========================================

function reloadData() {
    $.ajax({
        url: '/integration/api/rooms',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                dataTable.clear();
                response.data.forEach(function(room) {
                    const actions = `<button onclick="editIntegration(${room.IDNo})" class="btn btn-warning btn-sm"><i class="fa fa-edit"></i></button>`;
                    dataTable.row.add([
                        room.ROOM_NUMBER || 'N/A',
                        room.CLEAN_UP_DEVICE_ID || 'N/A',
                        room.DND_DEVICE_ID || 'N/A',
                        actions
                    ]);
                });
                dataTable.draw();
            }
        }
    });
}

// ========================================
// ACTION FUNCTIONS
// ========================================

function editIntegration(id) {
    $.ajax({
        url: `/integration/api/rooms/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                showEditModal(response.data);
            }
        }
    });
}

// ========================================
// MODAL FUNCTIONS
// ========================================

function showEditModal(room) {
    Swal.fire({
        title: 'Edit Integration',
        html: `
            <input type="text" class="form-control mb-2" id="editRoomNumber" value="${room.ROOM_NUMBER || ''}" readonly disabled>
            <input type="text" class="form-control mb-2" id="editCleanUpDeviceId" value="${room.CLEAN_UP_DEVICE_ID || ''}" placeholder="Clean Up Device ID">
            <input type="text" class="form-control mb-2" id="editDndDeviceId" value="${room.DND_DEVICE_ID || ''}" placeholder="DND Device ID">
        `,
        showCancelButton: true,
        confirmButtonText: 'Update',
        preConfirm: () => {
            return {
                IDNo: room.IDNo,
                CLEAN_UP_DEVICE_ID: document.getElementById('editCleanUpDeviceId').value,
                DND_DEVICE_ID: document.getElementById('editDndDeviceId').value
            };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            updateRoom(result.value);
        }
    });
}

function updateRoom(data) {
    $.ajax({
        url: '/integration/api/rooms/update',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function(response) {
            if (response.success) {
                Swal.fire('Success', 'Updated successfully', 'success').then(() => {
                    reloadData();
                });
            }
        }
    });
} 