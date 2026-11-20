// Load environment variables FIRST, before any other imports
require('dotenv').config();

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

console.log('🔍 Loaded ENV values:', {
  DATABASE_HOST: process.env.DATABASE_HOST,
  DATABASE_USER: process.env.DATABASE_USER,
  DATABASE_PASS: process.env.DATABASE_PASS ? '[set]' : '[missing]',
  DATABASE_NAME: process.env.DATABASE_NAME,
});

// Import routes
const routes = require('./routes/route');

const app = express();
const server = http.createServer(app);

// Trust proxy - Important for reverse proxy (Nginx) setup
// This allows Express to trust X-Forwarded-* headers from the proxy
app.set('trust proxy', true);

const io = socketIo(server, {
    cors: {
        origin: [
            'http://localhost:6000', 
            'http://localhost:4173', 
            'http://localhost:5002', 
            'http://45.32.103.210:5002', 
            'http://localhost', 
            'https://localhost',  // Capacitor Android WebView origin
            'https://pmsapp.3core21.com', 
            'https://pms.3core21.com'
        ],
        methods: ['GET', 'POST']
    },
    // Allow Socket.IO to work through reverse proxy
    allowEIO3: true,
    transports: ['websocket', 'polling']
});
const PORT = process.env.PORT || 5001;

// The Housekeeping phone app (Hotelapp/standalone-apks): its own CORS (any origin, bearer token, no cookie) for /api/staff-app and
// /<property code>/api/staff-app, and its own live updates on /api/socket.io (a second socket.io server: the web's /socket.io is untouched).
const { staffAppCors } = require('./routes/r_staff_app');
app.use(staffAppCors);
require('./services/staffAppRealtime').attach(server);

// CORS middleware for API access from frontend (not for the staff app above: it answers any origin itself)
const webCors = cors({
    origin: [
        'http://localhost:6000', 
        'http://localhost:4173', 
        'http://localhost:5002', 
        'http://45.32.103.210:5002', 
        'http://localhost', 
        'https://localhost',  // Capacitor Android WebView origin (for APK)
        'capacitor://localhost',  // Alternative Capacitor origin
        'https://pmsapp.3core21.com', 
        'https://pms.3core21.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});
app.use((req, res, next) => (req.staffApp ? next() : webCors(req, res, next)));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(cookieParser());

// Static files
// Before, every page change asked the server about every css / js file again (about 60 requests, each answered 304). Files that are
// loaded with a version (?v=...) are now kept by the browser for a day - bumping the version (as the pages already do) loads the new
// file at once. Files without a version are still checked every time, as before.
app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && /\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|eot)$/i.test(req.path)) {
        res.setHeader('Cache-Control', req.query && req.query.v ? 'public, max-age=86400' : 'no-cache');
    }
    next();
});
// Compression (no extra package: Node's own zlib). The calendar page alone loads ~100 scripts; sent as they are they are several MB, which is
// what makes the first opening of a page (and the kept-ready calendar of the Dashboard) slow on a slow network. The browser says
// 'Accept-Encoding: gzip'; the compressed copy of a file is kept in memory until the file changes.
const zlib = require('zlib');
const PUBLIC_DIR = path.join(__dirname, 'public');
const gzipCache = new Map();   // file -> { mtimeMs, buf }
app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !/\.(js|css|svg)$/i.test(req.path)) return next();
    if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
    let file;
    try { file = path.join(PUBLIC_DIR, decodeURIComponent(req.path)); } catch (e) { return next(); }
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return next();
    fs.stat(file, (err, st) => {
        if (err || !st.isFile() || st.size < 1024) return next();
        const reply = (buf) => {
            res.setHeader('Content-Type', /\.js$/i.test(file) ? 'application/javascript; charset=UTF-8' : /\.css$/i.test(file) ? 'text/css; charset=UTF-8' : 'image/svg+xml');
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Vary', 'Accept-Encoding');
            res.setHeader('Last-Modified', st.mtime.toUTCString());
            res.setHeader('ETag', 'W/"' + st.size + '-' + Math.floor(st.mtimeMs) + '-gz"');
            if (req.fresh) return res.status(304).end();
            res.setHeader('Content-Length', buf.length);
            return res.end(req.method === 'HEAD' ? undefined : buf);
        };
        const hit = gzipCache.get(file);
        if (hit && hit.mtimeMs === st.mtimeMs) return reply(hit.buf);
        fs.readFile(file, (e2, data) => {
            if (e2) return next();
            zlib.gzip(data, { level: 6 }, (e3, buf) => {
                if (e3) return next();
                gzipCache.set(file, { mtimeMs: st.mtimeMs, buf });
                reply(buf);
            });
        });
    });
});

// Pages and JSON answers (the calendar page is ~270 KB, the bookings of a year are bigger): compressed when they are big enough.
app.use((req, res, next) => {
    if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
    const send = res.send.bind(res);
    res.send = function (body) {
        try {
            if (req.method === 'HEAD' || res.headersSent || res.getHeader('Content-Encoding') || res.statusCode === 204 || res.statusCode === 304) return send(body);
            const isStr = typeof body === 'string';
            if (!isStr && !Buffer.isBuffer(body)) return send(body);
            const len = isStr ? Buffer.byteLength(body) : body.length;
            if (len < 1400) return send(body);
            const type = String(res.getHeader('Content-Type') || (isStr ? 'text/html' : ''));
            if (!/text\/|json|javascript|xml|svg/i.test(type)) return send(body);
            const gz = zlib.gzipSync(isStr ? Buffer.from(body) : body, { level: 5 });
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Vary', 'Accept-Encoding');
            return send(gz);
        } catch (e) {
            return send(body);
        }
    };
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { cacheControl: false }));

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

// ========================================
// GPS TRACKER TCP SERVER
// ========================================
// TCP Socket is more accurate and reliable for GPS trackers
// ST903 devices work better with TCP for real-time tracking
const { startGpsTrackerTcpServer } = require('./services/gpsTrackerTcpServer');
const GPS_TRACKER_TCP_PORT = process.env.GPS_TRACKER_TCP_PORT || 8090;
startGpsTrackerTcpServer(io, GPS_TRACKER_TCP_PORT);

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
const { runStartupMigrations } = require('./database_migrations/startupMigrations');

async function startServer() {
  try {
    await runStartupMigrations();
  } catch (error) {
    console.error('❌ Failed to run startup migrations:', error.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
    console.log(`📊 Database: ${process.env.DATABASE_NAME || 'Not configured'}`);
    console.log(`🔐 Authentication: JWT Token-based`);
    console.log(`🔌 Socket.IO is running`);
    console.log(`✅ API is running`);
  });
}

startServer(); 