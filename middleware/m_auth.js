const AuthModel = require('../models/authModel');
const SessionModel = require('../models/sessionModel');

class AuthMiddleware {
  // Check if user is authenticated (for API routes)
  static async isAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = AuthModel.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Check if token is still valid (not invalidated by new login)
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.'
        });
      }
      
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }

  // Check if user has specific permission
  static hasPermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Authentication required.'
        });
      }

      const userPermissions = req.user.PERMISSIONS || [];
      
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. ${permission} permission required.`
        });
      }

      next();
    };
  }

  // Check if user has any of the specified permissions
  static hasAnyPermission(permissions) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Authentication required.'
        });
      }

      const userPermissions = req.user.PERMISSIONS || [];
      const hasPermission = permissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.'
        });
      }

      next();
    };
  }

  // Check if user is admin
  static isAdmin(req, res, next) {
    return AuthMiddleware.hasPermission('admin')(req, res, next);
  }

  // Optional authentication (doesn't fail if no token)
  static async optionalAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (token) {
      try {
        const decoded = AuthModel.verifyToken(token);
        // Check if token is still valid
        if (decoded) {
          const isValid = await SessionModel.isTokenValid(decoded.userId, token);
          if (isValid) {
            req.user = decoded;
          }
        }
      } catch (error) {
        console.log('Invalid token:', error.message);
      }
    }

    next();
  }

  // Redirect to login if not authenticated (for page routes)
  static async requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.redirect('/login');
    }

    try {
      const decoded = AuthModel.verifyToken(token);
      if (!decoded) {
        return res.redirect('/login');
      }

      // Check if token is still valid (not invalidated by new login)
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        // Clear invalid cookie
        res.clearCookie('token');
        return res.redirect('/login?session=expired');
      }
      
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.redirect('/login');
    }
  }

  // Redirect to dashboard if already authenticated (for login page)
  static async redirectIfAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (token) {
      try {
        const decoded = AuthModel.verifyToken(token);
        // Check if token is still valid
        if (decoded) {
          const isValid = await SessionModel.isTokenValid(decoded.userId, token);
          if (isValid) {
            return res.redirect('/dashboard');
          }
        }
      } catch (error) {
        console.log('Invalid token:', error.message);
      }
    }

    next();
  }
}

module.exports = AuthMiddleware;
