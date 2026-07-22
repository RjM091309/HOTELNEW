const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.promise().query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function runMigration() {
  const alters = [
    ['DEDUCTION_AMOUNT', 'ADD COLUMN `DEDUCTION_AMOUNT` DECIMAL(12, 2) NULL DEFAULT NULL AFTER `AMOUNT`'],
    ['CASH_REFUND_AMOUNT', 'ADD COLUMN `CASH_REFUND_AMOUNT` DECIMAL(12, 2) NULL DEFAULT NULL AFTER `DEDUCTION_AMOUNT`'],
    ['APPLIED_TO_BALANCE', 'ADD COLUMN `APPLIED_TO_BALANCE` DECIMAL(12, 2) NULL DEFAULT NULL AFTER `CASH_REFUND_AMOUNT`'],
    ['REFUNDED_BY', 'ADD COLUMN `REFUNDED_BY` INT NULL DEFAULT NULL AFTER `REFUNDED_AT`']
  ];

  for (const [name, clause] of alters) {
    if (await columnExists('security_deposits', name)) {
      console.log('Skip (exists):', name);
      continue;
    }
    await pool.promise().query(`ALTER TABLE security_deposits ${clause}`);
    console.log('OK:', name);
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
