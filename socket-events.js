// ========================================
// SOCKET.IO EVENT HANDLERS
// ========================================

function setupSocketEvents(io) {
    io.on('connection', (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);
        
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
        // DISCONNECTION HANDLER
        // ========================================
        
        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
}

module.exports = setupSocketEvents;
