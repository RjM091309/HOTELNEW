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
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'flight_schedule'`
  );

  if (rows[0].cnt === 0) {
    await connection.query(`
      CREATE TABLE flight_schedule (
        IDNo INT NOT NULL AUTO_INCREMENT,
        FLIGHT_NUMBER VARCHAR(20) NOT NULL,
        ARRIVAL VARCHAR(100) NOT NULL,
        DEPARTURE VARCHAR(100) NOT NULL,
        ENCODED_BY INT NULL DEFAULT NULL,
        ENCODED_DT DATETIME NULL DEFAULT NULL,
        EDITED_BY INT NULL DEFAULT NULL,
        EDITED_DT DATETIME NULL DEFAULT NULL,
        ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (IDNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log('flight_schedule table created.');
  } else {
    console.log('flight_schedule table already exists.');
  }

  await connection.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
