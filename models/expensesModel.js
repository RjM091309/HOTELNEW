const { queryDatabasePromise } = require('../config/database');

// Expenses, built like the cage system's expense page (no settlement):
//   Group_Category -> main category name, Category -> sub category name
//   Description    -> description
//   IN_CHARGE      -> who is in charge
//   VEHICLE_ID/ODO -> the vehicle and its ODO (vehicle categories)
//   RECEIPT_PHOTO  -> receipt photo file in public/uploads/expense_receipts
//   Amount         -> amount
//   EXPENSE_DATE   -> the day it was keyed in (set on add, kept on edit)
// Dates are sent as text ('YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS') so they never shift with time zones.
// Older rows may still carry COMPANY_NAME / ReceiptNo (SI no.); they are kept.
// Categories live in expense_category.
const SELECT_EXPENSE = `
  SELECT e.IDNo, DATE_FORMAT(e.EXPENSE_DATE, '%Y-%m-%d') AS EXPENSE_DATE, e.COMPANY_NAME, e.Group_Category AS MAIN_CATEGORY, e.Category AS SUB_CATEGORY,
         e.Description, e.ReceiptNo, e.Amount, e.IN_CHARGE, e.VEHICLE_ID, e.ODO, e.RECEIPT_PHOTO,
         TRIM(CONCAT_WS(' ', v.MODEL_NAME, v.PLATE_NUMBER)) AS VEHICLE_NAME,
         e.ENCODED_BY, DATE_FORMAT(e.ENCODED_DT, '%Y-%m-%d %H:%i:%s') AS ENCODED_DT, e.EDITED_BY, e.EDITED_DT
  FROM expenses e
  LEFT JOIN vehicle v ON v.IDNo = e.VEHICLE_ID
`;

const expensesModel = {
  getAllExpenses: async (propertyId) =>
    queryDatabasePromise(`${SELECT_EXPENSE} WHERE e.ACTIVE = 1 AND e.PROPERTY_ID = ? ORDER BY e.EXPENSE_DATE DESC, e.IDNo DESC`, [propertyId]),

  getExpenseById: async (id, propertyId) => {
    const rows = await queryDatabasePromise(`${SELECT_EXPENSE} WHERE e.IDNo = ? AND e.ACTIVE = 1 AND e.PROPERTY_ID = ?`, [id, propertyId]);
    return rows[0] || null;
  },

  addExpense: async (e) => {
    const result = await queryDatabasePromise(
      `INSERT INTO expenses (EXPENSE_DATE, Group_Category, Category, Description, Amount, IN_CHARGE, VEHICLE_ID, ODO, RECEIPT_PHOTO, ENCODED_BY, ENCODED_DT, ACTIVE, PROPERTY_ID)
       VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, ?)`,
      [e.mainCategory, e.subCategory, e.details, e.amount, e.inCharge, e.vehicleId, e.odo, e.receiptPhoto, e.encodedBy, e.propertyId]
    );
    return { success: true, id: result.insertId };
  },

  /** `receiptPhoto`: undefined keeps the saved photo, null removes it, a file name replaces it. */
  updateExpense: async (id, e) => {
    const sets = ['Group_Category = ?', 'Category = ?', 'Description = ?', 'Amount = ?', 'IN_CHARGE = ?', 'VEHICLE_ID = ?', 'ODO = ?'];
    const params = [e.mainCategory, e.subCategory, e.details, e.amount, e.inCharge, e.vehicleId, e.odo];
    if (e.receiptPhoto !== undefined) {
      sets.push('RECEIPT_PHOTO = ?');
      params.push(e.receiptPhoto);
    }
    const result = await queryDatabasePromise(
      `UPDATE expenses SET ${sets.join(', ')}, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1 AND PROPERTY_ID = ?`,
      [...params, e.editedBy, id, e.propertyId]
    );
    return result.affectedRows === 0 ? { success: false, notFound: true } : { success: true };
  },

  deleteExpense: async (expenseId, editedBy, propertyId) => {
    const result = await queryDatabasePromise('UPDATE expenses SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ? AND ACTIVE = 1 AND PROPERTY_ID = ?', [editedBy, expenseId, propertyId]);
    return result.affectedRows === 0 ? { success: false, notFound: true } : { success: true };
  },

  // ---------- categories ----------

  getCategories: async () =>
    queryDatabasePromise('SELECT IDNo, CATEGORY, PARENT_ID FROM expense_category WHERE ACTIVE = 1 ORDER BY CATEGORY'),

  getCategoryById: async (id) => {
    const rows = await queryDatabasePromise('SELECT IDNo, CATEGORY, PARENT_ID FROM expense_category WHERE IDNo = ? AND ACTIVE = 1', [id]);
    return rows[0] || null;
  },

  /** An active category with this name at the same level (same main, or none), other than `exceptId`. */
  categoryNameTaken: async (name, parentId, exceptId = 0) => {
    const rows = await queryDatabasePromise(
      'SELECT IDNo FROM expense_category WHERE ACTIVE = 1 AND CATEGORY = ? AND PARENT_ID <=> ? AND IDNo <> ?',
      [name, parentId, exceptId]
    );
    return rows.length > 0;
  },

  addCategory: async (name, parentId, by) =>
    queryDatabasePromise('INSERT INTO expense_category (CATEGORY, PARENT_ID, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, ?, ?, NOW(), 1)', [name, parentId, by]),

  /** Renames a category and keeps the expenses filed under it with it. */
  renameCategory: async (category, name, by, mainName) => {
    await queryDatabasePromise('UPDATE expense_category SET CATEGORY = ?, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ?', [name, by, category.IDNo]);
    if (category.PARENT_ID) {
      await queryDatabasePromise('UPDATE expenses SET Category = ? WHERE ACTIVE = 1 AND Group_Category = ? AND Category = ?', [name, mainName, category.CATEGORY]);
    } else {
      await queryDatabasePromise('UPDATE expenses SET Group_Category = ? WHERE ACTIVE = 1 AND Group_Category = ?', [name, category.CATEGORY]);
    }
  },

  /** Archives a category (a main takes its subs with it). Expenses keep the name they were filed under. */
  deleteCategory: async (id, by) =>
    queryDatabasePromise('UPDATE expense_category SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW() WHERE ACTIVE = 1 AND (IDNo = ? OR PARENT_ID = ?)', [by, id, id]),

  /** Vehicles to pick from on a vehicle expense. */
  getVehicleChoices: async () =>
    queryDatabasePromise("SELECT IDNo, TRIM(CONCAT_WS(' ', MODEL_NAME, PLATE_NUMBER)) AS NAME FROM vehicle WHERE ACTIVE = 1 ORDER BY MODEL_NAME"),

  vehicleExists: async (id) => {
    const rows = await queryDatabasePromise('SELECT IDNo FROM vehicle WHERE IDNo = ? AND ACTIVE = 1', [id]);
    return rows.length > 0;
  }
};

module.exports = expensesModel;
