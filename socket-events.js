// ========================================
// SOCKET.IO EVENT HANDLERS
// ========================================

function setupSocketEvents(io) {
    io.on('connection', (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);
        
        // ========================================
        // ROOM CONTROL APP EVENTS
        // ========================================
        
        // Join room-specific channel
        socket.on('join-room', (data) => {
            const roomId = data.roomId;
            socket.join(`room-${roomId}`);
            console.log(`👤 Client ${socket.id} joined room-${roomId}`);
        });
        
        // Handle checkout requests from room control app
        socket.on('request-checkout', (data) => {
            const { roomId, guestName, timestamp } = data;
            console.log(`🏨 Checkout request received for Room ${roomId} from ${guestName}`);
            
            // Acknowledge receipt to the guest
            socket.emit('checkout-acknowledged', {
                roomId: roomId,
                message: 'Check-out request received',
                timestamp: new Date().toISOString()
            });
            
            // Broadcast checkout request to front desk staff
            socket.to('frontdesk-room').emit('checkout-request', {
                roomId: roomId,
                guestName: guestName,
                timestamp: timestamp,
                requestId: Date.now().toString()
            });
            
            // Also broadcast to dashboard for real-time updates
            socket.to('dashboard-room').emit('checkout-request', {
                roomId: roomId,
                guestName: guestName,
                timestamp: timestamp,
                requestId: Date.now().toString()
            });
            
            console.log(`📡 Checkout request broadcasted for Room ${roomId}`);
        });
        
        // Handle checkout confirmation from front desk
        socket.on('checkout-confirmed', (data) => {
            const { roomId, success, message, timestamp } = data;
            console.log(`✅ Checkout confirmed for Room ${roomId}: ${success ? 'Success' : 'Failed'}`);
            
            // Broadcast checkout result to the specific room
            io.to(`room-${roomId}`).emit('checkout-processed', {
                success: success,
                message: message,
                roomId: roomId,
                timestamp: timestamp
            });
            
            // Update dashboard
            socket.to('dashboard-room').emit('checkout-updated', {
                roomId: roomId,
                success: success,
                message: message,
                timestamp: timestamp
            });
            
            console.log(`📡 Checkout result broadcasted for Room ${roomId}`);
        });
        
        // ========================================
        // FRONT DESK EVENTS
        // ========================================
        
        // Join front desk room
        socket.on('join-frontdesk-room', () => {
            socket.join('frontdesk-room');
            console.log(`👤 Client ${socket.id} joined frontdesk-room`);
        });
        
        // Join bellman room
        socket.on('join-bellman-room', () => {
            socket.join('bellman-room');
            console.log(`👤 Client ${socket.id} joined bellman-room`);
        });
        
        // ========================================
        // GUEST LEVEL MAINTENANCE EVENTS
        // ========================================
        
        // Join guest level maintenance room
        socket.on('join-guest-level-room', () => {
            socket.join('guest-level-maintenance');
            console.log(`👤 Client ${socket.id} joined guest-level-maintenance room`);
        });
        
        // Handle guest level updates
        socket.on('guest-level-updated', (data) => {
            socket.to('guest-level-maintenance').emit('guest-level-refresh', data);
            console.log(`📡 Guest level update broadcasted: ${JSON.stringify(data)}`);
        });
        
        // ========================================
        // BELLMAN EVENTS
        // ========================================
        
        // Handle bellman requests from front desk
        socket.on('bellman-request', (data) => {
            const { roomId, type, message, timestamp, priority } = data;
            console.log(`🔔 Bellman request received for Room ${roomId}: ${type}`);
            
            // Broadcast to bellman room
            socket.to('bellman-room').emit('bellman-request', {
                roomId: roomId,
                type: type,
                message: message,
                timestamp: timestamp,
                priority: priority
            });
            
            console.log(`📡 Bellman request broadcasted for Room ${roomId}`);
        });
        
        // Handle guest level creation
        socket.on('guest-level-created', (data) => {
            socket.to('guest-level-maintenance').emit('guest-level-refresh', data);
            console.log(`📡 Guest level creation broadcasted: ${JSON.stringify(data)}`);
        });
        
        // ========================================
        // DASHBOARD EVENTS
        // ========================================
        
        // Join dashboard room
        socket.on('join-dashboard-room', () => {
            socket.join('dashboard-room');
            console.log(`👤 Client ${socket.id} joined dashboard-room`);
        });
        
        // Handle dashboard updates
        socket.on('dashboard-updated', (data) => {
            socket.to('dashboard-room').emit('dashboard-refresh', data);
            console.log(`📡 Dashboard update broadcasted: ${JSON.stringify(data)}`);
        });
        
        // Handle room status changes for dashboard
        socket.on('room-status-updated', (data) => {
            socket.to('dashboard-room').emit('dashboard-refresh', data);
            console.log(`📡 Room status update broadcasted: ${JSON.stringify(data)}`);
        });
        
        // Handle booking status changes for dashboard
        socket.on('booking-status-updated', (data) => {
            socket.to('dashboard-room').emit('dashboard-refresh', data);
            console.log(`📡 Booking status update broadcasted: ${JSON.stringify(data)}`);
        });
        
        // Handle payment status changes for dashboard
        socket.on('payment-status-updated', (data) => {
            socket.to('dashboard-room').emit('dashboard-refresh', data);
            console.log(`📡 Payment status update broadcasted: ${JSON.stringify(data)}`);
        });
        
        // ========================================
        // GPS TRACKER EVENTS
        // ========================================
        
        // Join GPS tracking room for a specific device
        socket.on('join-gps-tracking', (data) => {
            const deviceId = data.deviceId;
            if (deviceId) {
                socket.join(`gps-device-${deviceId}`);
                console.log(`📍 Client ${socket.id} joined GPS tracking for device ${deviceId}`);
            }
        });
        
        // Leave GPS tracking room
        socket.on('leave-gps-tracking', (data) => {
            const deviceId = data.deviceId;
            if (deviceId) {
                socket.leave(`gps-device-${deviceId}`);
                console.log(`📍 Client ${socket.id} left GPS tracking for device ${deviceId}`);
            }
        });
        
        // Listen for GPS location updates (broadcasted from controller)
        // This is handled automatically when GPS tracker sends data to the endpoint
        
        // ========================================
        // SESSION MANAGEMENT EVENTS
        // ========================================
        
        // Join user-specific session room
        socket.on('join-user-session', (data) => {
            const userId = data.userId;
            if (userId) {
                socket.join(`user-session-${userId}`);
                console.log(`🔐 Client ${socket.id} joined session room for user ${userId}`);
            }
        });
        
        // ========================================
        // DISCONNECTION HANDLER
        // ========================================
        
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
}

// Helper function to invalidate user sessions via Socket.IO
function invalidateUserSession(io, userId, reason = 'login') {
    if (io && userId) {
        const roomName = `user-session-${userId}`;
        const socketCount = io.sockets.adapter.rooms.get(roomName)?.size || 0;
        
        // Emit to all sockets in the user's session room
        io.to(roomName).emit('session-invalidated', {
            userId: userId,
            reason: reason,
            timestamp: new Date().toISOString(),
            message: 'Your session has been terminated because you logged in on another device.'
        });
        
        console.log(`🔐 Session invalidated for user ${userId} (reason: ${reason}, room: ${roomName}, sockets: ${socketCount})`);
        
        // Also log all connected rooms for debugging
        if (socketCount === 0) {
            console.warn(`⚠️ No sockets found in room ${roomName} - client may not have joined yet`);
        }
    }
}

module.exports = setupSocketEvents;
module.exports.invalidateUserSession = invalidateUserSession;
