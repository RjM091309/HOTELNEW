// config/db.js
const mysql = require('mysql2');  // Import mysql2
const dotenv = require('dotenv');


// Load environment variables
dotenv.config();

// Database connection pool configuration
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASS,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT,
  waitForConnections: true,  
  connectionLimit: 5,        // Reduced connection limit
  queueLimit: 0,
  connectTimeout: 30000,     // 30 seconds connection timeout
  charset: 'utf8mb4'         // Explicit charset
});

// Test the database connection and log a message
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error connecting to the database:', err.message);
    console.error('🔧 Please check your .env file configuration:');
    console.error('   DATABASE_HOST:', process.env.DATABASE_HOST);
    console.error('   DATABASE_USER:', process.env.DATABASE_USER);
    console.error('   DATABASE_NAME:', process.env.DATABASE_NAME);
    console.error('   DATABASE_PORT:', process.env.DATABASE_PORT || 3306);
  } else {
    console.log('✅ Connected to the database successfully');
    console.log('📊 Database:', process.env.DATABASE_NAME);
    console.log('🌐 Host:', process.env.DATABASE_HOST);
    connection.release(); // Release the connection back to the pool
  }
});

// General database query helper function
const queryDatabase = async (query, params = []) => {
  try {
    const result = await new Promise((resolve, reject) => {
      pool.query(query, params, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
    return result || [];
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error; // Re-throw to allow proper error handling in models
  }
};

// General database query helper function with promise support
const queryDatabasePromise = async (query, params = [], connection = null) => {
  try {
    if (connection) {
      // Use provided connection
      const [results] = await connection.promise().query(query, params);
      return results || [];
    } else {
      // Use pool
      const [results] = await pool.promise().query(query, params);
      return results || [];
    }
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

// Exporting the pool and helper functions
module.exports = {
  pool,
  queryDatabase,
  queryDatabasePromise
};
