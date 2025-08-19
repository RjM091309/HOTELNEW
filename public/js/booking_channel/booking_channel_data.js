// ========================================
// BOOKING CHANNEL MANAGEMENT - MAIN JAVASCRIPT
// ========================================

// ========================================
// INITIALIZATION
// ========================================

$(document).ready(function() {
    initializeBookingChannel();
});

function initializeBookingChannel() {
    setupEventHandlers();
    loadChannels();
}

// ========================================
// EVENT HANDLERS SETUP
// ========================================

function setupEventHandlers() {
    // Form submissions
    $('#addChannelForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        createChannel();
    });
    
    $('#editChannelForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        updateChannel();
    });

    // Add Channel button
    $(document).on('click', '#addChannelBtn', function() {
        $('#addChannelModal').modal('show');
    });

    // Modal close handlers
    setupModalHandlers();
}

function setupModalHandlers() {
    // Close modal when clicking outside
    $(document).on('click', '.modal', function(e) {
        if (e.target === this) {
            $(this).modal('hide');
        }
    });

    // Close modal with Escape key
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape') {
            $('.modal').modal('hide');
        }
    });

    // Handle data-dismiss="modal" clicks
    $(document).on('click', '[data-dismiss="modal"]', function() {
        const modalId = $(this).closest('.modal').attr('id');
        if (modalId === 'addChannelModal') {
            closeAddModal();
        } else if (modalId === 'editChannelModal') {
            closeEditModal();
        }
    });
}

// ========================================
// MODAL MANAGEMENT
// ========================================

function closeAddModal() {
    $('#addChannelModal').modal('hide');
    $('#addChannelForm')[0].reset();
}

function closeEditModal() {
    $('#editChannelModal').modal('hide');
    $('#editChannelForm')[0].reset();
}

// ========================================
// DATA OPERATIONS
// ========================================

function loadChannels() {
    $.ajax({
        url: '/booking_channel/api/channels',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                renderChannelsCards(response.data);
            } else {
                showAlert(response.message || 'Failed to load channels', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading channels:', error);
            showAlert('Error loading channels', 'error');
        }
    });
}

function renderChannelsCards(channels) {
    const container = $('#channelsContainer');
    container.empty();

    if (channels.length === 0) {
        container.html(`
            <div class="col-12">
                <div class="text-center text-muted">
                    <p>No channels found. Add your first channel to get started.</p>
                </div>
            </div>
        `);
        return;
    }

    channels.forEach(function(channel) {
        const card = createChannelCard(channel);
        container.append(card);
    });
}

function createChannelCard(channel) {
    const statusConfig = getStatusConfig(channel.status);
    
    return `
        <div class="col-md-3">
            <div class="card shadow-sm text-center p-4">
                <img src="/img/booking_channel/${channel.img || 'default.png'}" alt="${channel.name}" class="mb-3 channel-logo img-fluid">
                <h5 class="fw-bold mb-1">${channel.name}</h5>
                <p class="text-muted mb-2">
                    <i class="fa fa-circle ${statusConfig.class}"></i>
                    <span id="status-text-${channel.id}">${statusConfig.display}</span>
                </p>
                <div class="form-check form-switch d-flex justify-content-center">
                    <input class="form-check-input toggle-status" type="checkbox" id="statusToggle${channel.id}"
                        ${statusConfig.checked} onchange="toggleChannelStatus(${channel.id})">
                    <label class="form-check-label" for="statusToggle${channel.id}">
                        ${statusConfig.toggleText}
                    </label>
                </div>
                <div class="mt-3">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="editChannel(${channel.id})" title="Edit Channel">
                        <i class="fa fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        </div>
    `;
}

function getStatusConfig(status) {
    switch(status) {
        case 'Active':
            return {
                class: 'text-success',
                checked: 'checked',
                toggleText: 'On',
                display: 'Active'
            };
        case 'Inactive':
            return {
                class: 'text-danger',
                checked: '',
                toggleText: 'Off',
                display: 'Inactive'
            };
        default:
            return {
                class: 'text-muted',
                checked: '',
                toggleText: 'Off',
                display: status
            };
    }
}

// ========================================
// CRUD OPERATIONS
// ========================================

function createChannel() {
    // Get form values directly since HTML validation handles required fields
    const name = $('#channelName').val().trim();
    const apiKey = $('#channelApiKey').val().trim();
    const status = $('#channelStatus').val();
    
    // Debug logging
    console.log('Form values:', { name, apiKey, status });
    
    const formData = new FormData();
    
    // Add form fields
    formData.append('name', name);
    formData.append('api_key', apiKey);
    formData.append('status', status);
    
    // Add image file if selected
    const imageFile = $('#channelImg')[0].files[0];
    if (imageFile) {
        formData.append('channelImg', imageFile);
    }

    $.ajax({
        url: '/booking_channel/api/channels/create',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.success) {
                showAlert('Channel added successfully', 'success');
                closeAddModal();
                loadChannels();
            } else {
                showAlert(response.message || 'Failed to add channel', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error adding channel:', error);
            showAlert('Error adding channel', 'error');
        }
    });
}

function editChannel(channelId) {
    $.ajax({
        url: `/booking_channel/api/channels/${channelId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                populateEditForm(response.data);
                $('#editChannelModal').modal('show');
            } else {
                showAlert(response.message || 'Failed to load channel data', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading channel data:', error);
            showAlert('Error loading channel data', 'error');
        }
    });
}

function populateEditForm(channel) {
    $('#editChannelId').val(channel.id);
    $('#editChannelName').val(channel.name);
    $('#editChannelApiKey').val(channel.api_key);
    $('#editChannelStatus').val(channel.status);
    
    // Show current image info
    updateCurrentImageInfo(channel.img);
}

function updateCurrentImageInfo(img) {
    $('#editChannelImg').next('.current-image-info').remove();
    if (img) {
        $('#editChannelImg').after(`<small class="form-text text-muted current-image-info">Current: ${img}</small>`);
    }
}

function updateChannel() {
    // Get form values directly since HTML validation handles required fields
    const name = $('#editChannelName').val().trim();
    const apiKey = $('#editChannelApiKey').val().trim();
    const status = $('#editChannelStatus').val();
    
    // Debug logging
    console.log('Edit form values:', { name, apiKey, status });
    
    const formData = new FormData();
    
    // Add form fields
    formData.append('id', $('#editChannelId').val());
    formData.append('name', name);
    formData.append('api_key', apiKey);
    formData.append('status', status);
    
    // Add image file if selected
    const imageFile = $('#editChannelImg')[0].files[0];
    if (imageFile) {
        formData.append('channelImg', imageFile);
    }

    $.ajax({
        url: '/booking_channel/api/channels/update',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.success) {
                showAlert('Channel updated successfully', 'success');
                closeEditModal();
                loadChannels();
            } else {
                showAlert(response.message || 'Failed to update channel', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error updating channel:', error);
            showAlert('Error updating channel', 'error');
        }
    });
}

// ========================================
// STATUS TOGGLE FUNCTION
// ========================================

async function toggleChannelStatus(channelId) {
    try {
        const confirmation = await Swal.fire({
            title: 'Are you sure?',
            text: 'Do you want to change the channel status?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, update it!',
            cancelButtonText: 'Cancel'
        });

        if (confirmation.isConfirmed) {
            const response = await fetch(`/booking_channel/toggleStatus/${channelId}`, { method: 'PUT' });
            const data = await response.json();

            if (data.success) {
                updateStatusDisplay(channelId, data.newStatus);
                showSuccessMessage(data.newStatus);
                loadChannels();
            } else {
                showAlert(data.message, 'error');
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        showAlert('Failed to update channel status', 'error');
    }
}

function updateStatusDisplay(channelId, newStatus) {
    const statusText = document.getElementById(`status-text-${channelId}`);
    const switchLabel = document.querySelector(`label[for="statusToggle${channelId}"]`);

    if (statusText) statusText.textContent = newStatus;
    if (switchLabel) switchLabel.textContent = newStatus === 'Active' ? 'On' : 'Off';
}

function showSuccessMessage(newStatus) {
    Swal.fire({
        title: 'Success',
        text: `Channel status updated to ${newStatus}`,
        icon: 'success',
        confirmButtonText: 'OK'
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showAlert(message, type = 'info') {
    Swal.fire({
        title: type === 'success' ? 'Success!' : type === 'error' ? 'Error!' : 'Info',
        text: message,
        icon: type,
        confirmButtonText: 'OK'
    });
}
