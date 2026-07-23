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
       AND TABLE_NAME = 'flight_schedule'
       AND COLUMN_NAME = 'CITY'`
  );

  if (columns.length === 0) {
    await connection.query(
      `ALTER TABLE flight_schedule
       ADD COLUMN CITY VARCHAR(100) NULL DEFAULT NULL
       COMMENT 'City the airline flies to/from'
       AFTER FLIGHT_NUMBER`
    );
    console.log('Added CITY');
  } else {
    console.log('CITY already exists');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
