const AuthModel = require('../models/authModel');

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

      // Generate JWT token
      const token = AuthModel.generateToken(user);

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

      // Get fresh user data from database
      const user = await AuthModel.getUserById(decoded.userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      const newToken = AuthModel.generateToken(user);

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