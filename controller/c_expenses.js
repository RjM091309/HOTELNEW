const expensesModel = require('../models/expensesModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Expenses like the cage system's expense page (data entry only, no settlement):
// main / sub categories, expenses, return money ("sukli") and receipt photos.

const RECEIPT_DIR = 'public/uploads/expense_receipts';
const RETURN_MONEY = 'return money';

// Receipt photo upload, the same way vehicle photos are stored.
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true });
      cb(null, RECEIPT_DIR);
    },
    filename: function (req, file, cb) {
      cb(null, 'receipt-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname).toLowerCase());
    }
  }),
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('The receipt photo must be an image.'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
}).single('receiptPhoto');

const userName = (req) => (req.user && req.user.FULLNAME) || 'Unknown User';
const text = (v, max = 255) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const money = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/** Runs the upload, then the handler; answers with the upload error when the file is refused. */
const withUpload = (handler) => (req, res) =>
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Expenses error:', error);
      res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
  });

const removeReceiptFile = (fileName) => {
  if (!fileName) return;
  fs.unlink(path.join(RECEIPT_DIR, path.basename(fileName)), () => {});
};

/** The fields of the expense form, checked. Throws a message the user can read. */
async function expenseFields(body) {
  const e = {
    mainCategory: text(body.mainCategory),
    subCategory: text(body.subCategory) || null,
    details: text(body.details, 5000),
    inCharge: text(body.inCharge) || null,
    amount: money(body.amount),
    vehicleId: body.vehicleId ? Number(body.vehicleId) : null,
    odo: body.odo === undefined || body.odo === '' ? null : money(body.odo)
  };
  if (!e.mainCategory) throw new Error('Choose a main category.');
  if (!e.details || !(e.amount > 0)) throw new Error('Description and an amount are required.');
  if (e.odo !== null && !(e.odo >= 0)) throw new Error('ODO must be a number.');
  if (e.vehicleId && !(await expensesModel.vehicleExists(e.vehicleId))) throw new Error('Vehicle not found.');
  return e;
}

/** Everything the page shows: expenses, return money, categories and the vehicles to pick from. */
async function pageData() {
  const [expenses, returns, categories, vehicles] = await Promise.all([
    expensesModel.getAllExpenses(),
    expensesModel.getReturnMoney(),
    expensesModel.getCategories(),
    expensesModel.getVehicleChoices()
  ]);
  return { success: true, expenses, returns, categories, vehicles };
}

/** Sends the page data with a message, or the error message as a 400. */
async function reply(res, work, message) {
  try {
    await work();
    res.json({ ...(await pageData()), message });
  } catch (error) {
    if (error && error.message && !error.sql) return res.status(400).json({ success: false, message: error.message });
    console.error('Expenses error:', error);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}

function categoryName(body) {
  const name = text(body.name);
  if (!name) throw new Error('Enter a category name.');
  if (name.toLowerCase() === RETURN_MONEY) throw new Error('"Return Money" is kept for the change given back; choose another name.');
  return name;
}

const expensesController = {
  getAllExpenses: async (req, res) => {
    try {
      res.render('expenses/expenses', {
        title: 'Expenses',
        subTitle: 'Expenses Management',
        activePage: 'expenses',
        user: req.user || null
      });
    } catch (error) {
      console.error('Error rendering expenses page:', error);
      res.status(500).send('Error loading expenses page.');
    }
  },

  getExpensesData: async (req, res) => {
    try {
      res.json(await pageData());
    } catch (error) {
      console.error('Error fetching expenses data:', error);
      res.status(500).json({ success: false, message: 'Error retrieving expenses data.' });
    }
  },

  // ---------- expenses ----------

  addExpense: withUpload(async (req, res) => {
    const photo = req.file ? req.file.filename : null;
    await reply(
      res,
      async () => {
        try {
          const e = await expenseFields(req.body);
          await expensesModel.addExpense({ ...e, receiptPhoto: photo, encodedBy: userName(req) });
        } catch (error) {
          removeReceiptFile(photo);
          throw error;
        }
      },
      'Expense added successfully!'
    );
  }),

  updateExpense: withUpload(async (req, res) => {
    const photo = req.file ? req.file.filename : null;
    await reply(
      res,
      async () => {
        const before = await expensesModel.getExpenseById(req.params.id);
        try {
          if (!before) throw new Error('Expense not found.');
          const e = await expenseFields(req.body);
          // A new file replaces the photo; removePhoto clears it; otherwise it is kept.
          const receiptPhoto = photo || (req.body.removePhoto === '1' ? null : undefined);
          await expensesModel.updateExpense(req.params.id, { ...e, receiptPhoto, editedBy: userName(req) });
          if (receiptPhoto !== undefined) removeReceiptFile(before.RECEIPT_PHOTO);
        } catch (error) {
          removeReceiptFile(photo);
          throw error;
        }
      },
      'Expense updated successfully!'
    );
  }),

  deleteExpense: async (req, res) => {
    await reply(
      res,
      async () => {
        const result = await expensesModel.deleteExpense(req.params.id, userName(req));
        if (result.notFound) throw new Error('Expense not found or already deleted.');
      },
      'Expense deleted successfully!'
    );
  },

  // ---------- categories ----------

  addCategory: async (req, res) => {
    await reply(
      res,
      async () => {
        const name = categoryName(req.body);
        let parentId = null;
        if (req.body.parentId) {
          const main = await expensesModel.getCategoryById(req.body.parentId);
          if (!main || main.PARENT_ID) throw new Error('Main category not found.');
          parentId = main.IDNo;
        }
        if (await expensesModel.categoryNameTaken(name, parentId)) throw new Error(`"${name}" already exists.`);
        await expensesModel.addCategory(name, parentId, userName(req));
      },
      'Category added.'
    );
  },

  renameCategory: async (req, res) => {
    await reply(
      res,
      async () => {
        const name = categoryName(req.body);
        const category = await expensesModel.getCategoryById(req.params.id);
        if (!category) throw new Error('Category not found.');
        if (await expensesModel.categoryNameTaken(name, category.PARENT_ID || null, category.IDNo)) throw new Error(`"${name}" already exists.`);
        const main = category.PARENT_ID ? await expensesModel.getCategoryById(category.PARENT_ID) : null;
        await expensesModel.renameCategory(category, name, userName(req), main ? main.CATEGORY : null);
      },
      'Category renamed.'
    );
  },

  deleteCategory: async (req, res) => {
    await reply(
      res,
      async () => {
        const category = await expensesModel.getCategoryById(req.params.id);
        if (!category) throw new Error('Category not found.');
        await expensesModel.deleteCategory(category.IDNo, userName(req));
      },
      'Category deleted.'
    );
  },

  // ---------- return money ----------

  addReturnMoney: async (req, res) => {
    await reply(
      res,
      async () => {
        const amount = money(req.body.amount);
        if (!(amount > 0)) throw new Error('Enter the amount returned.');
        await expensesModel.addReturnMoney({ details: text(req.body.details, 5000) || null, amount, encodedBy: userName(req) });
      },
      'Return money saved.'
    );
  },

  updateReturnMoney: async (req, res) => {
    await reply(
      res,
      async () => {
        const amount = money(req.body.amount);
        if (!(amount > 0)) throw new Error('Enter the amount returned.');
        const ok = await expensesModel.updateReturnMoney(req.params.id, { details: text(req.body.details, 5000) || null, amount, editedBy: userName(req) });
        if (!ok) throw new Error('Return money not found.');
      },
      'Return money updated.'
    );
  },

  deleteReturnMoney: async (req, res) => {
    await reply(
      res,
      async () => {
        if (!(await expensesModel.deleteReturnMoney(req.params.id, userName(req)))) throw new Error('Return money not found.');
      },
      'Return money deleted.'
    );
  }
};

module.exports = expensesController;
