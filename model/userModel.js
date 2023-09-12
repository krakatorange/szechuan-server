const db = require('../config/db.config');

class User {
  static addUser(phoneNumber, callback) {
    const query = 'INSERT INTO users (phoneNumber) VALUES (?)';
    db.query(query, [phoneNumber], (err, result) => {
      if (err) {
        console.error('Error adding user: ', err);
        callback(err, null);
      } else {
        console.log('User added successfully');
        callback(null, result);
      }
    });
  }
}

module.exports = User;
