const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function runMigration() {
  const filePath = path.join(__dirname, 'create_security_deposits_table.sql');
  const sql = fs.readFileSync(filePath, 'utf8');

  const statements = [
    `CREATE TABLE IF NOT EXISTS security_deposits (
      IDNo INT NOT NULL AUTO_INCREMENT,
      BOOKING_ID INT NOT NULL,
      AMOUNT DECIMAL(12, 2) NOT NULL,
      PAYMENT_METHOD VARCHAR(50) NOT NULL DEFAULT 'cash',
      STATUS ENUM('held', 'refunded') NOT NULL DEFAULT 'held',
      REMARKS VARCHAR(255) NULL DEFAULT NULL,
      ENCODED_BY INT NULL DEFAULT NULL,
      COLLECTED_AT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      REFUNDED_AT DATETIME NULL DEFAULT NULL,
      ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (IDNo),
      KEY idx_security_deposits_booking (BOOKING_ID),
      KEY idx_security_deposits_status (STATUS)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `INSERT INTO security_deposits (BOOKING_ID, AMOUNT, PAYMENT_METHOD, STATUS, REMARKS, ENCODED_BY, COLLECTED_AT, ACTIVE)
     SELECT p.BOOKING_ID, p.AMOUNT_PAID, COALESCE(p.PAYMENT_METHOD, 'cash'), 'held', p.REMARKS, p.ENCODED_BY,
            COALESCE(p.PAYMENT_DATE, NOW()), 1
     FROM payments p
     WHERE p.PAYMENT_TYPE = 'security_deposit'
       AND NOT EXISTS (
         SELECT 1 FROM security_deposits sd
         WHERE sd.BOOKING_ID = p.BOOKING_ID AND sd.AMOUNT = p.AMOUNT_PAID
       )`,
    `DELETE FROM payments WHERE PAYMENT_TYPE = 'security_deposit'`
  ];

  for (const statement of statements) {
    await pool.promise().query(statement);
    console.log('OK:', statement.slice(0, 60).replace(/\s+/g, ' ') + '...');
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
