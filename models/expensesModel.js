const { queryDatabasePromise } = require('../config/database');

const expensesModel = {
  // Get all active expenses
  getAllExpenses: async () => {
    try {
      const query = 'SELECT * FROM expenses WHERE ACTIVE = 1 ORDER BY ENCODED_DT DESC';
      return await queryDatabasePromise(query);
    } catch (error) {
      throw error;
    }
  },

  // Add a new expense
  addExpense: async (category, receipt, description, amount, encodedBy) => {
    try {
      const query = `
        INSERT INTO expenses (Category, ReceiptNo, Description, Amount, ENCODED_BY, ENCODED_DT, ACTIVE)
        VALUES (?, ?, ?, ?, ?, NOW(), 1)
      `;
      const result = await queryDatabasePromise(query, [category, receipt, description, amount, encodedBy]);
      return { success: true, id: result.insertId };
    } catch (error) {
      throw error;
    }
  },

  // Get expense by ID
  getExpenseById: async (id) => {
    try {
      const query = 'SELECT * FROM expenses WHERE IDNo = ? AND ACTIVE = 1';
      const results = await queryDatabasePromise(query, [id]);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw error;
    }
  },

  // Update an existing expense
  updateExpense: async (id, category, receipt, description, amount, editedBy) => {
    try {
      const query = `
        UPDATE expenses
        SET Category = ?, ReceiptNo = ?, Description = ?, Amount = ?, EDITED_BY = ?, EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const result = await queryDatabasePromise(query, [category, receipt, description, amount, editedBy, id]);
      if (result.affectedRows === 0) {
        return { success: false, notFound: true };
      } else {
        return { success: true };
      }
    } catch (error) {
      throw error;
    }
  },

  // Soft delete an expense
  deleteExpense: async (expenseId) => {
    try {
      const query = 'UPDATE expenses SET ACTIVE = 0 WHERE IDNo = ?';
      const result = await queryDatabasePromise(query, [expenseId]);
      if (result.affectedRows === 0) {
        return { success: false, notFound: true };
      } else {
        return { success: true };
      }
    } catch (error) {
      throw error;
    }
  }
};

module.exports = expensesModel; 