require('dotenv').config();
const mysql = require('mysql2');
const setupQueries = require('../components/queries');

const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    multipleStatements: true
  });

// DB Connection
db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL");

  db.query(setupQueries, (err, results) => {
    if (err) {
      console.error("Error setting up database:", err);
      return;
    }
    console.log("Database setup complete");
   
  });
});



module.exports = db;