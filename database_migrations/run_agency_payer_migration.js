require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT
  });

  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'booking'
       AND COLUMN_NAME = 'AGENCY_PAYER'`
  );

  if (rows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE booking
       ADD COLUMN AGENCY_PAYER VARCHAR(10) NULL DEFAULT NULL
       COMMENT 'Who pays for agency booking: agency or guest'
       AFTER AGENCY_ID`
    );
    console.log('AGENCY_PAYER column added.');
  } else {
    console.log('AGENCY_PAYER column already exists.');
  }

  await connection.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
