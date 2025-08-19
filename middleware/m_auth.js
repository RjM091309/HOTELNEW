const AuthModel = require('../models/authModel');

class AuthMiddleware {
  // Check if user is authenticated (for API routes)
  static isAuthenticated(req, res, next) {
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
      
      req.user = decoded;
      next();
    } catch (error) {
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
  static optionalAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (token) {
      try {
        const decoded = AuthModel.verifyToken(token);
        req.user = decoded;
      } catch (error) {
        console.log('Invalid token:', error.message);
      }
    }

    next();
  }

  // Redirect to login if not authenticated (for page routes)
  static requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      return res.redirect('/login');
    }

    try {
      const decoded = AuthModel.verifyToken(token);
      if (!decoded) {
        return res.redirect('/login');
      }
      
      req.user = decoded;
      next();
    } catch (error) {
      return res.redirect('/login');
    }
  }

  // Redirect to dashboard if already authenticated (for login page)
  static redirectIfAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

    if (token) {
      try {
        const decoded = AuthModel.verifyToken(token);
        if (decoded) {
          return res.redirect('/dashboard');
        }
      } catch (error) {
        console.log('Invalid token:', error.message);
      }
    }

    next();
  }
}

module.exports = AuthMiddleware;
