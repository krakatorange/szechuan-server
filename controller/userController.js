const User = require('../model/userModel'); // Adjust the path accordingly

const userController = {
  addUser: (req, res) => {
    console.log('addUser controller reached');
    const phoneNumber = req.body.phoneNumber; // Extract phoneNumber property
    console.log('Received phoneNumber:', phoneNumber); // Log received phoneNumber
    User.addUser(phoneNumber, (err, result) => {
      if (err) {
        console.error('Error adding user: ', err);
        return res.status(500).json({ error: 'An error occurred' });
      }
      console.log('User added successfully');
      return res.status(201).json({ message: 'User added successfully' });
    });
  },

  // You can define more methods here for other user-related actions
};

module.exports = userController;
