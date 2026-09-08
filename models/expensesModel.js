const { queryDatabasePromise } = require('../config/database');

// Expense record shape:
//   EXPENSE_DATE  -> Date of Expense
//   COMPANY_NAME  -> Company Name (vendor)
//   Description   -> Details of Expense
//   ReceiptNo     -> SI no. (sales invoice number)
//   Amount        -> Amount
const expensesModel = {
  // Get all active expenses
  getAllExpenses: async () => {
    const query = `
      SELECT IDNo, EXPENSE_DATE, COMPANY_NAME, Description, ReceiptNo, Amount,
             ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT
      FROM expenses
      WHERE ACTIVE = 1
      ORDER BY EXPENSE_DATE DESC, IDNo DESC
    `;
    return await queryDatabasePromise(query);
  },

  // Add a new expense
  addExpense: async ({ expenseDate, companyName, siNo, details, amount, encodedBy }) => {
    const query = `
      INSERT INTO expenses (EXPENSE_DATE, COMPANY_NAME, ReceiptNo, Description, Amount, ENCODED_BY, ENCODED_DT, ACTIVE)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
    `;
    const result = await queryDatabasePromise(query, [
      expenseDate || null,
      companyName || null,
      siNo || null,
      details,
      amount,
      encodedBy
    ]);
    return { success: true, id: result.insertId };
  },

  // Get expense by ID
  getExpenseById: async (id) => {
    const query = `
      SELECT IDNo, EXPENSE_DATE, COMPANY_NAME, Description, ReceiptNo, Amount,
             ENCODED_BY, ENCODED_DT, EDITED_BY, EDITED_DT
      FROM expenses
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    const results = await queryDatabasePromise(query, [id]);
    return results.length > 0 ? results[0] : null;
  },

  // Update an existing expense
  updateExpense: async (id, { expenseDate, companyName, siNo, details, amount, editedBy }) => {
    const query = `
      UPDATE expenses
      SET EXPENSE_DATE = ?, COMPANY_NAME = ?, ReceiptNo = ?, Description = ?, Amount = ?,
          EDITED_BY = ?, EDITED_DT = NOW()
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    const result = await queryDatabasePromise(query, [
      expenseDate || null,
      companyName || null,
      siNo || null,
      details,
      amount,
      editedBy,
      id
    ]);
    return result.affectedRows === 0 ? { success: false, notFound: true } : { success: true };
  },

  // Soft delete an expense
  deleteExpense: async (expenseId) => {
    const query = 'UPDATE expenses SET ACTIVE = 0 WHERE IDNo = ?';
    const result = await queryDatabasePromise(query, [expenseId]);
    return result.affectedRows === 0 ? { success: false, notFound: true } : { success: true };
  }
};

module.exports = expensesModel;
