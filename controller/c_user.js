// ========================================
// USER INFO CONTROLLER
// ========================================

const UserModel = require('../models/userModels');

class UserController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Main user info management page
  static async getUserInfoManagement(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('user_info/user-info-management', {
        title: 'User Information Management',
        subTitle: 'User Information Management',
        page: 'user-info-management',
        activePage: 'user_info',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });

    } catch (error) {
      console.error('Error loading user info management:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // ========================================
  // API ROUTES - USER INFO CRUD
  // ========================================
  
  // Get all users
  static async getAllUsers(req, res) {
    try {
      const users = await UserModel.getAllUsers();
      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching users',
        error: error.message
      });
    }
  }

  // Get user by ID
  static async getUserById(req, res) {
    try {
      const { id } = req.params;
      const user = await UserModel.getUserById(id);
      
      if (user) {
        res.json({
          success: true,
          data: user
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user',
        error: error.message
      });
    }
  }

  // Create new user
  static async createUser(req, res) {
    try {
      const { fullname, username, password, confirm_password, role } = req.body;
      
      if (!fullname || !username || !password || !confirm_password || !role) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided'
        });
      }

      // Check if passwords match
      if (password !== confirm_password) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match'
        });
      }

      // Check if username is available
      const isUsernameAvailable = await UserModel.checkUsernameAvailability(username);
      if (!isUsernameAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }

      const userData = {
        fullname,
        username,
        password,
        role,
        encodedBy: req.user ? req.user.userId : req.session.userId
      };

      const result = await UserModel.createUser(userData);
      
      if (result) {
        res.json({
          success: true,
          message: 'User created successfully',
          data: { id: result.insertId }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to create user'
        });
      }
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating user',
        error: error.message
      });
    }
  }

  // Update user
  static async updateUser(req, res) {
    try {
      const { userId, fullname, username, password, confirm_password, role } = req.body;
      
      if (!userId || !fullname || !username || !role) {
        return res.status(400).json({
          success: false,
          message: 'User ID, full name, username, and role are required'
        });
      }

      // Check if passwords match if password is provided
      if (password && password !== confirm_password) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match'
        });
      }

      // Check if new username is available (if username is being changed)
      const currentUser = await UserModel.getUserById(userId);
      if (currentUser && username !== currentUser.USERNAME) {
        const isUsernameAvailable = await UserModel.checkUsernameAvailability(username);
        if (!isUsernameAvailable) {
          return res.status(400).json({
            success: false,
            message: 'Username already exists'
          });
        }
      }

      const userData = {
        userId,
        fullname,
        username,
        password,
        role,
        editedBy: req.user ? req.user.userId : req.session.userId
      };

      const result = await UserModel.updateUser(userData);
      
      if (result) {
        res.json({
          success: true,
          message: 'User updated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating user',
        error: error.message
      });
    }
  }

  // Delete user
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await UserModel.deleteUser(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'User deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting user',
        error: error.message
      });
    }
  }

  // Check username availability
  static async checkUsernameAvailability(req, res) {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({
          success: false,
          message: 'Username is required'
        });
      }

      const isAvailable = await UserModel.checkUsernameAvailability(username);
      
      res.json({
        success: true,
        available: isAvailable
      });
    } catch (error) {
      console.error('Error checking username availability:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking username availability',
        error: error.message
      });
    }
  }

}

module.exports = UserController;
