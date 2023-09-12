// models/db.js
const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost', // Change this if your MySQL server is hosted elsewhere
  user: 'root',
  password: '',
  database: 's3-app',
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed: ', err);
  } else {
    console.log('Connected to the database');
  }
});

module.exports = db;
