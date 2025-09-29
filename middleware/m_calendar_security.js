const { body, validationResult } = require('express-validator');

// Calendar input validation middleware
class CalendarSecurityMiddleware {
  
  // Validate booking update request
  static validateBookingUpdate() {
    return [
      body('id')
        .notEmpty()
        .withMessage('Booking ID is required')
        .isInt({ min: 1 })
        .withMessage('Booking ID must be a valid positive number'),
      
      body('room')
        .notEmpty()
        .withMessage('Room number is required')
        .matches(/^[A-Z0-9\-_]+$/i)
        .withMessage('Room number contains invalid characters'),
      
      body('checkIn')
        .notEmpty()
        .withMessage('Check-in date is required')
        .isISO8601()
        .withMessage('Check-in date must be a valid date')
        .custom((value) => {
          const date = new Date(value);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (date < today) {
            throw new Error('Check-in date cannot be in the past');
          }
          return true;
        }),
      
      body('checkOut')
        .notEmpty()
        .withMessage('Check-out date is required')
        .isISO8601()
        .withMessage('Check-out date must be a valid date')
        .custom((value, { req }) => {
          const checkInDate = new Date(req.body.checkIn);
          const checkOutDate = new Date(value);
          
          if (checkOutDate <= checkInDate) {
            throw new Error('Check-out date must be after check-in date');
          }
          return true;
        }),
      
      body('isExtended')
        .optional()
        .isBoolean()
        .withMessage('isExtended must be a boolean'),
      
      this.handleValidationErrors
    ];
  }

  // Validate room transfer request
  static validateRoomTransfer() {
    return [
      body('bookingId')
        .notEmpty()
        .withMessage('Booking ID is required')
        .isInt({ min: 1 })
        .withMessage('Booking ID must be a valid positive number'),
      
      body('newRoomId')
        .notEmpty()
        .withMessage('New room ID is required')
        .isInt({ min: 1 })
        .withMessage('New room ID must be a valid positive number'),
      
      body('transferDate')
        .notEmpty()
        .withMessage('Transfer date is required')
        .isISO8601()
        .withMessage('Transfer date must be a valid date'),
      
      this.handleValidationErrors
    ];
  }

  // Validate date range queries
  static validateDateRange() {
    return [
      body('start')
        .optional()
        .isISO8601()
        .withMessage('Start date must be valid'),
      
      body('end')
        .optional()
        .isISO8601()
        .withMessage('End date must be valid')
        .custom((value, { req }) => {
          if (value && req.body.start) {
            const startDate = new Date(req.body.start);
            const endDate = new Date(value);
            
            if (endDate <= startDate) {
              throw new Error('End date must be after start date');
            }
            
            // Prevent excessive date ranges (max 1 year)
            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 365) {
              throw new Error('Date range cannot exceed 1 year');
            }
          }
          return true;
        }),
      
      this.handleValidationErrors
    ];
  }

  // Rate limiting middleware
  static rateLimit(req, res, next) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100;

    // Simple in-memory rate limiting (in production, use Redis)
    if (!global.rateLimitMap) {
      global.rateLimitMap = new Map();
    }

    const clientData = global.rateLimitMap.get(clientIp) || { count: 0, resetTime: now + windowMs };
    
    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + windowMs;
    } else {
      clientData.count++;
    }

    global.rateLimitMap.set(clientIp, clientData);

    if (clientData.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }

    next();
  }

  // Sanitize input data
  static sanitizeInput(req, res, next) {
    const sanitizeObject = (obj) => {
      if (typeof obj === 'string') {
        // Remove HTML tags and normalize whitespace
        return obj
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      if (typeof obj === 'object' && obj !== null) {
        const sanitized = {};
        for (const key in obj) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
        return sanitized;
      }
      
      return obj;
    };

    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    next();
  }

  // Handle validation errors
  static handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          field: err.param || err.path,
          message: err.msg,
          value: err.value
        }))
      });
    }
    
    next();
  }

  // CSRF protection check - Simplified version
  static csrfProtection(req, res, next) {
    // Skip CSRF for GET requests
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    const csrfToken = req.body._csrf || req.headers['x-csrf-token'];
    
    // For now, accept any token or temporarily disable CSRF
    // TODO: Implement proper CSRF token validation when session is setup
    if (!csrfToken) {
      console.log('⚠️ No CSRF token found, allowing request (temporary bypass)');
      console.log('Request body:', req.body);
      console.log('Request headers:', {
        'x-csrf-token': req.headers['x-csrf-token'],
        'x-requested-with': req.headers['x-requested-with'],
        'origin': req.headers['origin'],
        'user-agent': req.headers['user-agent']
      });
    }

    // Temporarily allow all requests - can be tightened later
    next();
  }

  // XSS protection headers
  static setSecurityHeaders(req, res, next) {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content Security Policy for calendar pages
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
      "img-src 'self' data: https:",
      "connect-src 'self' ws: wss:",
      "font-src 'self' https://fonts.gstatic.com"
    ].join('; ');
    
    res.setHeader('Content-Security-Policy', cspHeader);
    
    next();
  }

  // Audit logging for calendar operations
  static auditLog(action) {
    return (req, res, next) => {
      const originalSend = res.send;
      
      res.send = function(data) {
        // Log successful or failed operations
        const auditEntry = {
          timestamp: new Date().toISOString(),
          action,
          userId: req.user?.userId || 'anonymous',
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          endpoint: req.path,
          method: req.method
        };

        // Log to database or audit service
        console.log('📋 Calendar audit:', auditEntry);
        
        // Call original send
        originalSend.call(this, data);
      };
      
      next();
    };
  }
}

module.exports = CalendarSecurityMiddleware;
