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

  const [tables] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'pickup_drop'`
  );

  if (tables[0].cnt === 0) {
    await connection.query(`
      CREATE TABLE pickup_drop (
        IDNo INT NOT NULL AUTO_INCREMENT,
        NAME VARCHAR(255) NOT NULL,
        FLIGHT_NUMBER VARCHAR(20) NULL DEFAULT NULL,
        PERSON_COUNT INT NULL DEFAULT NULL,
        ENCODED_BY INT NULL DEFAULT NULL,
        ENCODED_DT DATETIME NULL DEFAULT NULL,
        EDITED_BY INT NULL DEFAULT NULL,
        EDITED_DT DATETIME NULL DEFAULT NULL,
        ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
        PRIMARY KEY (IDNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log('Created pickup_drop table');
  } else {
    console.log('pickup_drop table already exists');
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
