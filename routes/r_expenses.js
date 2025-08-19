const express = require('express');
const router = express.Router();
const expensesController = require('../controller/c_expenses');

// Get all active expenses (page load)
router.get('/', expensesController.getAllExpenses);

// API endpoint to get expenses data
router.get('/data', expensesController.getExpensesData);

// Add a new expense
router.post('/add', expensesController.addExpense);

// Fetch specific expense by ID
router.get('/edit_expense', expensesController.getExpenseById);

// Update an existing expense
router.post('/edit_expense/:id', expensesController.updateExpense);

// Soft delete an expense
router.delete('/delete/:id', expensesController.deleteExpense);

module.exports = router; 