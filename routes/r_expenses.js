const express = require('express');
const router = express.Router();
const expensesController = require('../controller/c_expenses');

// Page
router.get('/', expensesController.getAllExpenses);

// Expenses, categories and vehicle choices for the page
router.get('/data', expensesController.getExpensesData);

// Expenses (multipart: the receipt photo is uploaded with the form)
router.post('/add', expensesController.addExpense);
router.post('/edit_expense/:id', expensesController.updateExpense);
router.delete('/delete/:id', expensesController.deleteExpense);

// Main / sub categories
router.post('/categories', expensesController.addCategory);
router.post('/categories/:id', expensesController.renameCategory);
router.delete('/categories/:id', expensesController.deleteCategory);

module.exports = router;
