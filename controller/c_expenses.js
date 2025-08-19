const expensesModel = require('../models/expensesModel');

const expensesController = {
  // Get all active expenses (for initial page load)
  getAllExpenses: async (req, res) => {
    try {
      const user = req.user || null;
      res.render('expenses/expenses', { 
        title: 'Expenses',
        subTitle: 'Expenses Management',
        activePage: 'expenses',
        user 
      });
    } catch (error) {
      console.error('Error rendering expenses page:', error);
      res.status(500).send('Error loading expenses page.');
    }
  },

  // API endpoint to get expenses data
  getExpensesData: async (req, res) => {
    try {
      const expenses = await expensesModel.getAllExpenses();
      res.json({ 
        success: true, 
        expenses: expenses 
      });
    } catch (error) {
      console.error('Error fetching expenses data:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error retrieving expenses data.' 
      });
    }
  },

  // Add a new expense
  addExpense: async (req, res) => {
    try {
      const { category, receipt, description, amount } = req.body;
      
      if (!category || !description || !amount) {
        return res.json({ success: false, message: 'All required fields must be filled out.' });
      }

      const encodedBy = req.user ? req.user.FULLNAME : 'Unknown User';
      const result = await expensesModel.addExpense(category, receipt, description, amount, encodedBy);
      
      if (result.success) {
        // Fetch the newly created expense to return complete data
        const newExpense = await expensesModel.getExpenseById(result.id);
        res.json({ 
          success: true, 
          message: 'Expense added successfully!',
          expense: newExpense
        });
      } else {
        res.status(500).json({ success: false, message: 'Error adding expense.' });
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      res.status(500).json({ success: false, message: 'Error adding expense.' });
    }
  },

  // Get expense by ID
  getExpenseById: async (req, res) => {
    try {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ message: 'Expense ID is required' });
      }

      const expense = await expensesModel.getExpenseById(id);
      
      if (!expense) {
        return res.status(404).json({ message: 'Expense not found' });
      }

      res.json({ expense });
    } catch (error) {
      console.error('Error fetching expense data:', error);
      res.status(500).json({ message: 'Error fetching expense data' });
    }
  },

  // Update an existing expense
  updateExpense: async (req, res) => {
    try {
      const id = req.params.id;
      const { category, receipt, description, amount } = req.body;

      if (!category || !description || !amount) {
        return res.json({ success: false, message: 'All required fields must be filled out.' });
      }

      const editedBy = req.user ? req.user.FULLNAME : 'Unknown User';
      const result = await expensesModel.updateExpense(id, category, receipt, description, amount, editedBy);
      
      if (result.success) {
        // Fetch the updated expense to return complete data
        const updatedExpense = await expensesModel.getExpenseById(id);
        res.json({ 
          success: true, 
          message: 'Expense updated successfully!',
          expense: updatedExpense
        });
      } else if (result.notFound) {
        res.status(404).json({ success: false, message: 'Expense not found or already inactive.' });
      } else {
        res.status(500).json({ success: false, message: 'Error updating expense.' });
      }
    } catch (error) {
      console.error('Error updating expense:', error);
      res.status(500).json({ success: false, message: 'Error updating expense.' });
    }
  },

  // Soft delete an expense
  deleteExpense: async (req, res) => {
    try {
      const expenseId = req.params.id;
      const result = await expensesModel.deleteExpense(expenseId);
      
      if (result.success) {
        res.status(200).json({ message: 'Expense deleted successfully' });
      } else if (result.notFound) {
        res.status(404).json({ error: 'Expense not found or already inactive' });
      } else {
        res.status(500).json({ error: 'Error deleting expense' });
      }
    } catch (error) {
      console.error('Error deleting expense:', error);
      res.status(500).json({ error: 'Error deleting expense' });
    }
  }
};

module.exports = expensesController; 