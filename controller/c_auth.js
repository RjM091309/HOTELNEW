const AuthModel = require('../models/authModel');
const SessionModel = require('../models/sessionModel');
const { invalidateUserSession } = require('../socket-events');

class AuthController {
  // Render login page
  static async renderLoginPage(req, res) {
    try {
      res.render('login', {
        title: 'Login',
        subTitle: 'Sign In',
        layout: false // Don't use the main layout
      });
    } catch (error) {
      console.error('Error rendering login page:', error);
      res.status(500).render('error', { message: 'Server error' });
    }
  }

  // Handle login
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      // Validate input
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required'
        });
      }

      // Get user from database
      const user = await AuthModel.getUserByUsername(username);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password'
        });
      }

      // Verify password
      const isValidPassword = await AuthModel.verifyPassword(password, user.PASSWORD);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password'
        });
      }

      // Check if user is admin (PERMISSIONS === 1)
      const isAdmin = user.PERMISSIONS === 1;

      // Generate JWT token first (needed for invalidateAllSessions)
      const token = AuthModel.generateToken(user);

      // For non-admin users: invalidate all previous sessions (1-to-1 login)
      // For admin users: allow multiple sessions
      if (!isAdmin) {
        // Get io instance from app
        const io = req.app.get('io');
        
        // Invalidate previous sessions in database (keep current token)
        await SessionModel.invalidateAllSessions(user.IDNo, token);
        console.log(`🔐 Invalidated previous sessions for user ${user.IDNo} (non-admin login)`);
        
        // Emit Socket.IO event to invalidate sessions on all devices
        if (io && invalidateUserSession) {
          try {
            invalidateUserSession(io, user.IDNo, 'login');
            console.log(`📡 Socket.IO: Emitted session-invalidated event for user ${user.IDNo}`);
          } catch (error) {
            console.error('Error emitting Socket.IO session invalidation:', error);
          }
        } else {
          if (!io) {
            console.warn('⚠️ Socket.IO not available - session invalidation will rely on polling');
          }
          if (!invalidateUserSession) {
            console.warn('⚠️ invalidateUserSession function not available');
          }
        }
      }

      // Add new session to tracking
      await SessionModel.addSession(user.IDNo, token);

      // Set token in cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      res.json({
        success: true,
        message: 'Login successful',
        token: token,
        user: {
          userId: user.IDNo,
          FULLNAME: user.FULLNAME,
          USERNAME: user.USERNAME,
          PERMISSIONS: user.PERMISSIONS || []
        },
        redirectUrl: '/dashboard'
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Handle logout
  static async logout(req, res) {
    try {
      const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
      
      // Remove session from tracking if token exists
      if (token) {
        try {
          const decoded = AuthModel.verifyToken(token);
          if (decoded && decoded.userId) {
            await SessionModel.removeSession(decoded.userId, token);
          }
        } catch (error) {
          // Token might be expired, ignore
        }
      }

      // Clear cookie
      res.clearCookie('token');

      res.json({
        success: true,
        message: 'Logout successful',
        redirectUrl: '/login'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get current session token (for Socket.IO setup)
  static async getCurrentToken(req, res) {
    try {
      const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token found'
        });
      }

      const decoded = AuthModel.verifyToken(token);
      if (!decoded || !decoded.userId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Check if token is still valid
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Session expired'
        });
      }

      // Return token for frontend use (stored in localStorage)
      res.json({
        success: true,
        token: token
      });
    } catch (error) {
      console.error('Error getting current token:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update Socket.IO socket ID for session
  static async updateSocketId(req, res) {
    try {
      const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
      const { socketId } = req.body;
      
      if (!token || !socketId) {
        return res.status(400).json({
          success: false,
          message: 'Token and socket ID are required'
        });
      }

      const decoded = AuthModel.verifyToken(token);
      if (!decoded || !decoded.userId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Check if token is still valid
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.'
        });
      }

      const result = await SessionModel.updateSocketId(decoded.userId, token, socketId);
      
      if (result) {
        console.log(`📡 Socket ID updated for user ${decoded.userId}: ${socketId}`);
        res.json({
          success: true,
          message: 'Socket ID updated successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to update socket ID'
        });
      }
    } catch (error) {
      console.error('Error updating socket ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Refresh token
  static async refreshToken(req, res) {
    try {
      const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      const decoded = AuthModel.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      // Check if token is still valid (not invalidated)
      const isValid = await SessionModel.isTokenValid(decoded.userId, token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.'
        });
      }

      // Get fresh user data from database
      const user = await AuthModel.getUserById(decoded.userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      const newToken = AuthModel.generateToken(user);

      // Remove old token and add new token to session tracking
      await SessionModel.removeSession(user.IDNo, token);
      await SessionModel.addSession(user.IDNo, newToken);

      // Set new token in cookie
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        token: newToken,
        user: {
          userId: user.IDNo,
          FULLNAME: user.FULLNAME,
          USERNAME: user.USERNAME,
          PERMISSIONS: user.PERMISSIONS || []
        }
      });

    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }
}

module.exports = AuthController; 