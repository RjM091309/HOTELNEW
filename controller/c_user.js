// ========================================
// USER INFO CONTROLLER
// ========================================

const UserModel = require('../models/userModels');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const AVATAR_DIR = path.join(__dirname, '../public/uploads/avatars');

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
      const { fullname, username, password, confirm_password, role, roomId } = req.body;
      
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
        roomId,
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
      const { userId, fullname, username, password, confirm_password, role, roomId } = req.body;
      
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
        roomId,
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

  // Get current user info
  static async getCurrentUser(req, res) {
    try {
      const userId = req.user ? req.user.userId : req.session.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const user = await UserModel.getUserById(userId);
      
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
      console.error('Error fetching current user:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching current user',
        error: error.message
      });
    }
  }

  // ========================================
  // SELF-SERVICE PROFILE (any logged-in user, own account only)
  // ========================================

  static async renderProfilePage(req, res) {
    try {
      const userId = req.user ? req.user.userId : null;
      if (!userId) return res.redirect('/login');

      const profile = await UserModel.getUserById(userId);
      if (!profile) return res.redirect('/login');

      res.render('user/profile', {
        title: 'My Profile',
        subTitle: 'My Profile',
        activePage: 'profile',
        hideBreadcrumb: false,
        user: req.user,
        userId,
        tabOrder: req.user?.TAB_ORDER || null,
        profile
      });
    } catch (error) {
      console.error('Error loading profile page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  static async updateOwnProfile(req, res) {
    try {
      const userId = req.user ? req.user.userId : null;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const fullname = (req.body.fullname || '').trim();
      if (!fullname) {
        return res.status(400).json({ success: false, message: 'Full name is required' });
      }

      await UserModel.updateOwnFullname(userId, fullname);
      res.json({ success: true, message: 'Profile updated successfully', data: { fullname } });
    } catch (error) {
      console.error('Error updating own profile:', error);
      res.status(500).json({ success: false, message: 'Error updating profile', error: error.message });
    }
  }

  static async changeOwnPassword(req, res) {
    try {
      const userId = req.user ? req.user.userId : null;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'All password fields are required' });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'New passwords do not match' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      }

      const storedHash = await UserModel.getPasswordHash(userId);
      if (!storedHash) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const isMatch = await bcrypt.compare(currentPassword, storedHash);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      await UserModel.updateOwnPassword(userId, newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Error changing own password:', error);
      res.status(500).json({ success: false, message: 'Error changing password', error: error.message });
    }
  }

  // Lock screen unlock check - verifies the CURRENTLY logged-in user's own
  // password, does not change anything or touch the session/JWT. The lock
  // itself is a client-side overlay (see lock-screen.js); this just answers
  // "was that the right password" so it can be dismissed.
  static async verifyOwnPassword(req, res) {
    try {
      const userId = req.user ? req.user.userId : null;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }

      const storedHash = await UserModel.getPasswordHash(userId);
      if (!storedHash) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const isMatch = await bcrypt.compare(password, storedHash);
      res.json({ success: isMatch, message: isMatch ? 'Unlocked' : 'Incorrect password' });
    } catch (error) {
      console.error('Error verifying own password:', error);
      res.status(500).json({ success: false, message: 'Error verifying password', error: error.message });
    }
  }

  static async uploadOwnPhoto(req, res) {
    try {
      const userId = req.user ? req.user.userId : null;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No photo uploaded' });
      }

      fs.mkdirSync(AVATAR_DIR, { recursive: true });

      const filename = `${userId}-${Date.now()}.webp`;
      const filePath = path.join(AVATAR_DIR, filename);

      // Square-crop to a small avatar size and convert to WebP - keeps
      // uploads (which could be multi-MB phone photos) down to a few KB.
      await sharp(req.file.buffer)
        .resize(256, 256, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(filePath);

      const previous = await UserModel.getUserById(userId);
      await UserModel.updateOwnPhoto(userId, filename);

      // Clean up the old avatar file now that the DB points at the new one.
      if (previous && previous.PROFILE_PHOTO) {
        const oldPath = path.join(AVATAR_DIR, previous.PROFILE_PHOTO);
        fs.unlink(oldPath, () => {});
      }

      res.json({ success: true, message: 'Photo updated successfully', data: { photoUrl: `/uploads/avatars/${filename}` } });
    } catch (error) {
      console.error('Error uploading own photo:', error);
      res.status(500).json({ success: false, message: 'Error uploading photo', error: error.message });
    }
  }

}

module.exports = UserController;
