// ========================================
// EMPLOYEE CONTROLLER
// ========================================

const EmployeeModel = require('../models/employeeModel');
const { queryDatabasePromise } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/img/employee';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'employee-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('photo');

class EmployeeController {
  
  // ========================================
  // PAGE RENDERING
  // ========================================
  
  // Main employee management page
  static async getEmployeeManagement(req, res) {
    try {
      // Get user from JWT token (following dashboard pattern)
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      res.render('employee/employee-management', {
        title: 'Employee Management',
        subTitle: 'Employee Management',
        page: 'employee-management',
        activePage: 'employee',
        hideBreadcrumb: false,
        user,
        userId,
        tabOrder
      });

    } catch (error) {
      console.error('Error loading employee management:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        error: error
      });
    }
  }

  // ========================================
  // API ROUTES - EMPLOYEE CRUD
  // ========================================
  
  // Get all employees
  static async getAllEmployees(req, res) {
    try {
      const employees = await EmployeeModel.getAllEmployees();
      res.json({
        success: true,
        data: employees
      });
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching employees',
        error: error.message
      });
    }
  }

  // Get employee by ID
  static async getEmployeeById(req, res) {
    try {
      const { id } = req.params;
      const employee = await EmployeeModel.getEmployeeById(id);
      
      if (employee) {
        res.json({
          success: true,
          data: employee
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
    } catch (error) {
      console.error('Error fetching employee:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching employee',
        error: error.message
      });
    }
  }

  // Create new employee
  static async createEmployee(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { fullName, contactNo, address, dateStarted, department } = req.body;
        
        if (!fullName || !contactNo || !address || !dateStarted || !department) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Get image filename if uploaded
        const photo = req.file ? req.file.filename : 'employee-default.png';

        const employeeData = {
          FULLNAME: fullName,
          CONTACTNO: contactNo,
          ADDRESS: address,
          DATE_STARTED: dateStarted,
          DEPARTMENT: department,
          PHOTO: photo,
          ACTIVE: 1,
          ENCODED_BY: req.user ? req.user.userId : req.session.userId,
          ENCODED_DT: new Date()
        };

        const result = await EmployeeModel.createEmployee(employeeData);
        
        if (result) {
          res.json({
            success: true,
            message: 'Employee created successfully',
            data: { id: result.id }
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Failed to create employee'
          });
        }
      } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({
          success: false,
          message: 'Error creating employee',
          error: error.message
        });
      }
    });
  }

  // Update employee
  static async updateEmployee(req, res) {
    upload(req, res, async function (err) {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }

      try {
        const { employeeId, fullName, department, contactNo, address, dateStarted } = req.body;
        
        if (!employeeId || !fullName || !department || !contactNo || !address || !dateStarted) {
          return res.status(400).json({
            success: false,
            message: 'All required fields must be provided'
          });
        }

        // Get image filename if uploaded
        const newPhoto = req.file ? req.file.filename : null;

        let photo = newPhoto;
        
        // If no new photo uploaded, get existing photo
                            if (!newPhoto) {
                      const existingEmployee = await EmployeeModel.getEmployeeById(employeeId);
                      photo = existingEmployee.PHOTO || 'employee-default.png';
                    }

        const employeeData = {
          IDNo: employeeId,
          FULLNAME: fullName,
          DEPARTMENT: department,
          CONTACTNO: contactNo,
          ADDRESS: address,
          DATE_STARTED: dateStarted,
          PHOTO: photo,
          EDITED_BY: req.user ? req.user.userId : req.session.userId,
          EDITED_DT: new Date()
        };

        const result = await EmployeeModel.updateEmployee(employeeData);
        
        if (result) {
          res.json({
            success: true,
            message: 'Employee updated successfully'
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'Employee not found'
          });
        }
      } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({
          success: false,
          message: 'Error updating employee',
          error: error.message
        });
      }
    });
  }

  // Delete employee
  static async deleteEmployee(req, res) {
    try {
      const { id } = req.params;
      const editedBy = req.user ? req.user.userId : req.session.userId;
      const result = await EmployeeModel.deleteEmployee(id, editedBy);
      
      if (result) {
        res.json({
          success: true,
          message: 'Employee deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting employee',
        error: error.message
      });
    }
  }

}

module.exports = EmployeeController; 