const express = require('express');
const router = express.Router();
const userController = require('../controller/userController'); // Adjust the path accordingly

// Define routes for user-related actions
router.post('/addUser', userController.addUser);

module.exports = router;
