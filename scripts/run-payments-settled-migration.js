const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASS || '',
    database: process.env.DATABASE_NAME || 'hotel',
    port: process.env.DATABASE_PORT || 3306,
  });

  const [columns] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payments'
       AND COLUMN_NAME IN ('SETTLED_DATE', 'SETTLED_BY')`
  );

  const existing = new Set(columns.map((row) => row.COLUMN_NAME));

  if (!existing.has('SETTLED_DATE')) {
    await connection.query(
      `ALTER TABLE payments
       ADD COLUMN SETTLED_DATE DATETIME NULL DEFAULT NULL
       COMMENT 'Date when credit/marker payment was settled'
       AFTER ENCODED_BY`
    );
    console.log('Added SETTLED_DATE');
  } else {
    console.log('SETTLED_DATE already exists');
  }

  if (!existing.has('SETTLED_BY')) {
    await connection.query(
      `ALTER TABLE payments
       ADD COLUMN SETTLED_BY INT NULL DEFAULT NULL
       COMMENT 'User who marked payment as settled'
       AFTER SETTLED_DATE`
    );
    console.log('Added SETTLED_BY');
  } else {
    console.log('SETTLED_BY already exists');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
