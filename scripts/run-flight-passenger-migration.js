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
       AND COLUMN_NAME IN ('FLIGHT_NUMBER', 'PASSENGER_COUNT')`
  );

  const existing = new Set(columns.map((row) => row.COLUMN_NAME));

  if (!existing.has('FLIGHT_NUMBER')) {
    await connection.query(
      `ALTER TABLE booking
       ADD COLUMN FLIGHT_NUMBER VARCHAR(20) NULL DEFAULT NULL
       COMMENT 'Flight number for airport pick-up/drop-off (PUAP)'
       AFTER BED_COUNT`
    );
    console.log('Added FLIGHT_NUMBER');
  } else {
    console.log('FLIGHT_NUMBER already exists');
  }

  if (!existing.has('PASSENGER_COUNT')) {
    await connection.query(
      `ALTER TABLE booking
       ADD COLUMN PASSENGER_COUNT INT NULL DEFAULT NULL
       COMMENT 'Number of passengers for airport pick-up/drop-off (PUAP)'
       AFTER FLIGHT_NUMBER`
    );
    console.log('Added PASSENGER_COUNT');
  } else {
    console.log('PASSENGER_COUNT already exists');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
