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
       AND COLUMN_NAME = 'DROPOFF_FLIGHT_NUMBER'`
  );

  if (columns.length === 0) {
    await connection.query(
      `ALTER TABLE booking
       ADD COLUMN DROPOFF_FLIGHT_NUMBER VARCHAR(20) NULL DEFAULT NULL
       COMMENT 'Departure flight number for airport drop-off (PUAP) - FLIGHT_NUMBER holds the pick-up/arrival flight number'
       AFTER FLIGHT_NUMBER`
    );
    console.log('Added DROPOFF_FLIGHT_NUMBER');
  } else {
    console.log('DROPOFF_FLIGHT_NUMBER already exists');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
