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
       AND TABLE_NAME = 'booking'
       AND COLUMN_NAME = 'PICKUP_DROP_SPECIAL_NOTES'`
  );

  if (columns.length === 0) {
    await connection.query(
      `ALTER TABLE booking
       ADD COLUMN PICKUP_DROP_SPECIAL_NOTES TEXT NULL DEFAULT NULL
       COMMENT 'Special notes for pick-up and drop-off printouts'
       AFTER PASSENGER_COUNT`
    );
    console.log('Added PICKUP_DROP_SPECIAL_NOTES');
  } else {
    console.log('PICKUP_DROP_SPECIAL_NOTES already exists');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
