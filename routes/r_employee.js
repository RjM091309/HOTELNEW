// ========================================
// EMPLOYEE ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const EmployeeController = require('../controller/c_employee');

// ========================================
// PAGE ROUTES
// ========================================

// Employee management page
router.get('/', EmployeeController.getEmployeeManagement);
router.get('/management', EmployeeController.getEmployeeManagement);

// ========================================
// API ROUTES - EMPLOYEE CRUD
// ========================================

// Get all employees
router.get('/api/employees', EmployeeController.getAllEmployees);

// Get employee by ID
router.get('/api/employees/:id', EmployeeController.getEmployeeById);

// Create new employee
router.post('/api/employees/create', EmployeeController.createEmployee);

// Update employee
router.post('/api/employees/update', EmployeeController.updateEmployee);

// Delete employee
router.delete('/api/employees/:id', EmployeeController.deleteEmployee);



module.exports = router; 