// ========================================
// DASHBOARD SOCKET.IO CONFIGURATION
// ========================================

// Initialize Socket.IO connection for dashboard (only if available)
let dashboardSocket = null;

if (typeof io !== 'undefined') {
    // Initialize Socket.IO connection for dashboard
    dashboardSocket = io({
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: true
    });

    // Connection event handlers
    dashboardSocket.on('connect', () => {
        console.log('🔌 Dashboard connected to Socket.IO server');
        console.log('📡 Dashboard Socket ID:', dashboardSocket.id);
        
        // Join dashboard room
        dashboardSocket.emit('join-dashboard-room');
    });

    dashboardSocket.on('disconnect', () => {
        console.log('🔌 Dashboard disconnected from Socket.IO server');
    });

    dashboardSocket.on('connect_error', (error) => {
        console.error('❌ Dashboard Socket.IO connection error:', error);
    });
} else {
    console.log('⚠️ Socket.IO not available - running in non-socket mode');
}

// Dashboard-specific events
if (dashboardSocket) {
    dashboardSocket.on('dashboard-refresh', (data) => {
        console.log('📡 Received dashboard refresh event:', data);
        
        // Refresh dashboard data based on the event type
        if (data && data.action) {
            switch (data.action) {
                case 'room-status-updated':
                case 'booking-status-updated':
                case 'payment-status-updated':
                case 'dashboard-updated':
                    // Refresh the dashboard data
                    if (typeof reloadDashboardData === 'function') {
                        reloadDashboardData();
                    }
                    
                    // Also refresh the overview cards specifically
                    refreshDashboardOverviewCards();
                    
                    // Show notification
                    if (data.message) {
                        showDashboardNotification(data.message, data.action);
                    }
                    break;
                    
                case 'booking-updated':
                case 'room-transfer-completed':
                case 'booking-extended':
                case 'guest-checked-in-occupied':
                    // For calendar updates, room transfers, extensions, and calendar check-ins, refresh the entire dashboard
                    if (typeof reloadDashboardData === 'function') {
                        reloadDashboardData();
                    }
                    
                    // Also refresh the overview cards specifically
                    refreshDashboardOverviewCards();
                    
                    // For extensions, also refresh the Extended tab specifically
                    if (data.action === 'booking-extended') {
                        refreshExtendedTab();
                    }
                    
                    // For calendar check-ins, also refresh the Today Check-in and Occupied tabs
                    if (data.action === 'guest-checked-in-occupied') {
                        refreshCheckInTabs();
                    }
                    
                    // Show notification
                    if (data.message) {
                        showDashboardNotification(data.message, data.action);
                    }
                    break;
            }
        }
    });
    
    // Handle room status updates specifically
    dashboardSocket.on('room-status-updated', (data) => {
        console.log('📡 Received room status update event:', data);
        
        // Refresh the dashboard data
        if (typeof reloadDashboardData === 'function') {
            reloadDashboardData();
        }
        
        // Also refresh the overview cards specifically
        refreshDashboardOverviewCards();
        
        // Show notification
        if (data.message) {
            showDashboardNotification(data.message, data.action);
        }
    });
}

// Function to refresh dashboard overview cards
function refreshDashboardOverviewCards() {
    console.log('🔄 Refreshing dashboard overview cards...');
    
    // Fetch updated dashboard counts via AJAX
    $.ajax({
        url: '/dashboard/counts',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                updateOverviewCards(response.data);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error refreshing dashboard overview cards:', error);
        }
    });
}

// Function to refresh the Extended tab specifically
function refreshExtendedTab() {
    console.log('🔄 Refreshing Extended tab...');
    
    // Fetch updated extended data via AJAX
    $.ajax({
        url: '/dashboard/extended-data',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                updateExtendedTab(response.data);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error refreshing Extended tab:', error);
        }
    });
}

// Function to refresh the Check-in and Occupied tabs specifically
function refreshCheckInTabs() {
    console.log('🔄 Refreshing Check-in and Occupied tabs...');
    
    // Fetch updated check-in and occupied data via AJAX
    $.ajax({
        url: '/dashboard/check-in-occupied-data',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            if (response.success) {
                updateCheckInTabs(response.data);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error refreshing Check-in and Occupied tabs:', error);
        }
    });
}

// Function to update the Extended tab with new data
function updateExtendedTab(data) {
    console.log('📊 Updating Extended tab with data:', data);
    
    const extendedContent = $('#extended-content');
    
    if (!data || data.length === 0) {
        extendedContent.html(`
            <div class="text-center py-5">
                <h4 style="color: #6c757d; margin-bottom: 0.5rem;">No Extended Bookings</h4>
                <p style="color: #6c757d; font-size: 0.9rem;">No bookings have been extended beyond their original checkout date.</p>
            </div>
        `);
        return;
    }
    
    // Update the Extended count in the overview
    $('.dashboard-btn-row').each(function() {
        if ($(this).find('.dashboard-btn-row-item').text().includes("Extended")) {
            $(this).find('.dashboard-btn-row-metric').text(data.length);
        }
    });
    
    // For now, just show a message that the tab needs refresh
    // In a full implementation, you would render the booking cards here
    extendedContent.html(`
        <div class="text-center py-3">
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Extended bookings have been updated. Please refresh the page to see the latest data.
            </div>
        </div>
    `);
}

// Function to update the Check-in and Occupied tabs with new data
function updateCheckInTabs(data) {
    console.log('📊 Updating Check-in and Occupied tabs with data:', data);
    
    // Update the Checked-in count in the overview
    if (data.todayCheckedIn !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Checked-in")) {
                $(this).find('.dashboard-btn-row-metric').text(data.todayCheckedIn);
            }
        });
    }
    
    // Update the Occupied count in the overview
    if (data.occupiedRooms !== undefined) {
        $('.dashboard-btn-row1').each(function() {
            if ($(this).find('.dashboard-btn-row-item1').text().includes("Occupied")) {
                const occupiedCount = Number(data.occupiedRooms) - Number(data.occupiedNotMove || 0);
                $(this).find('.dashboard-btn-row-metric1').text(occupiedCount);
            }
        });
    }
    
    // For now, just show a message that the tabs need refresh
    // In a full implementation, you would render the booking cards here
    const checkInContent = $('#checked-in-content');
    const occupiedContent = $('#occupied-content');
    
    if (checkInContent.length) {
        checkInContent.find('.scrollable-container').html(`
            <div class="text-center py-3">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Today Check-in data has been updated. Please refresh the page to see the latest data.
                </div>
            </div>
        `);
    }
    
    if (occupiedContent.length) {
        occupiedContent.find('.scrollable-container').html(`
            <div class="text-center py-3">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Occupied rooms data has been updated. Please refresh the page to see the latest data.
                </div>
            </div>
        `);
    }
}

// Function to update the overview cards with new data
function updateOverviewCards(data) {
    console.log('📊 Updating dashboard overview cards with data:', data);
    
    // Update Booking Overview
    if (data.totalBookingsToday !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Today's Check-in")) {
                $(this).find('.dashboard-btn-row-metric').text(data.totalBookingsToday);
            }
        });
    }
    if (data.todayCheckedIn !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Checked-in")) {
                $(this).find('.dashboard-btn-row-metric').text(data.todayCheckedIn);
            }
        });
    }
    if (data.lateInOut !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Late Check-out/Check-in")) {
                $(this).find('.dashboard-btn-row-metric').text(data.lateInOut);
            }
        });
    }
    
    // Update Check-out Overview
    if (data.todayCheckedOut !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Today's Check-out")) {
                $(this).find('.dashboard-btn-row-metric').text(data.todayCheckedOut);
            }
        });
    }
    if (data.lateCheckout !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Late Check-out")) {
                $(this).find('.dashboard-btn-row-metric').text(data.lateCheckout);
            }
        });
    }
    if (data.extended !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Extended")) {
                $(this).find('.dashboard-btn-row-metric').text(data.extended);
            }
        });
    }
    
    // Update Rooms Overview
    if (data.totalRooms !== undefined) {
        $('.dashboard-btn-row1').each(function() {
            if ($(this).find('.dashboard-btn-row-item1').text().includes("Rooms")) {
                $(this).find('.dashboard-btn-row-metric1').text(data.totalRooms);
            }
        });
    }
    if (data.availableRooms !== undefined) {
        const availableCount = Number(data.availableRooms) + Number(data.occupiedNotMove || 0);
        $('.dashboard-btn-row1').each(function() {
            if ($(this).find('.dashboard-btn-row-item2').text().includes("Available")) {
                $(this).find('.dashboard-btn-row-metric2').text(availableCount);
            }
        });
    }
    if (data.occupiedRooms !== undefined) {
        const occupiedCount = Number(data.occupiedRooms) - Number(data.occupiedNotMove || 0);
        $('.dashboard-btn-row1').each(function() {
            if ($(this).find('.dashboard-btn-row-item1').text().includes("Occupied")) {
                $(this).find('.dashboard-btn-row-metric1').text(occupiedCount);
            }
        });
    }
    if (data.cleaningRooms !== undefined) {
        $('.dashboard-btn-row1').each(function() {
            if ($(this).find('.dashboard-btn-row-item2').text().includes("Cleaning")) {
                $(this).find('.dashboard-btn-row-metric2').text(data.cleaningRooms);
            }
        });
    }
    if (data.underMaintenanceRooms !== undefined) {
        $('.dashboard-btn-row1').each(function() {
            if ($(this).find('.dashboard-btn-row-item1').text().includes("Under Maintenance")) {
                $(this).find('.dashboard-btn-row-metric2').text(data.underMaintenanceRooms);
            }
        });
    }
    
    // Update Monthly Booking Overview
    if (data.totalBookingsMonthly !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Monthly Booking")) {
                $(this).find('.dashboard-btn-row-metric').text(data.totalBookingsMonthly);
            }
        });
    }
    if (data.completedBookingsMonthly !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Completed")) {
                $(this).find('.dashboard-btn-row-metric').text(data.completedBookingsMonthly);
            }
        });
    }
    if (data.pendingBookingsMonthly !== undefined) {
        $('.dashboard-btn-row').each(function() {
            if ($(this).find('.dashboard-btn-row-item').text().includes("Pending")) {
                $(this).find('.dashboard-btn-row-metric').text(data.pendingBookingsMonthly);
            }
        });
    }
    
    console.log('✅ Dashboard overview cards updated successfully');
}

// Function to show dashboard notifications
function showDashboardNotification(message, type = 'info') {
    // Just log to console for now - system already has notification handling
    console.log(`📊 Dashboard Update: ${message}`);
}

// Export socket for use in other dashboard modules
window.dashboardSocket = dashboardSocket;
