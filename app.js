const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const moment = require('moment');
const mysql = require('mysql2');
const cookieParser = require('cookie-parser')
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const setupSocketEvents = require('./socket-events');
require('dotenv').config();

console.log('🔍 Loaded ENV values:', {
  DATABASE_HOST: process.env.DATABASE_HOST,
  DATABASE_USER: process.env.DATABASE_USER,
  DATABASE_PASS: process.env.DATABASE_PASS,
  DATABASE_NAME: process.env.DATABASE_NAME,
});

// Import routes
const routes = require('./routes/route');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ['http://45.32.103.210:6000', 'http://45.32.103.210:4173', 'http://45.32.103.210:5002'],
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.PORT || 5001;

// CORS middleware for API access from frontend
app.use(cors({
    origin: ['http://45.32.103.210:6000', 'http://45.32.103.210:4173', 'http://45.32.103.210:5002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Debug middleware to log requests
app.use((req, res, next) => {
    // console.log(`${req.method} ${req.url}`);
    next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout/layout');

// Global variables for views
app.use((req, res, next) => {
    // User will be set from JWT token in protected routes
    res.locals.user = req.user || null;
    res.locals.moment = moment;
    next();
});

// Use routes
app.use('/', routes);

// Setup Socket.IO events
setupSocketEvents(io);

// Make io available to routes
app.set('io', io);

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('error/404', {
        title: 'Page Not Found',
        subTitle: '404 Error'
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
    console.log(`📊 Database: ${process.env.DATABASE_NAME || 'Not configured'}`);
    console.log(`🔐 Authentication: JWT Token-based`);
    console.log(`🔌 Socket.IO is running`);
    console.log(`✅ API is running`);
}); 