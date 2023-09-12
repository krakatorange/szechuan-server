// routes/eventRoutes.js
const express = require('express');
const router = express.Router();
const eventController = require('../controller/event.controller');
const multer = require('multer');
const storage = multer.memoryStorage(); // Store the file in memory as a buffer
const upload = multer({ storage: storage });

router.post('/create', upload.single('coverPhoto'), eventController.createEvent);
router.get('/all/:userId', eventController.getAllEvents);
router.post('/:eventId/upload', upload.single('galleryImage'), eventController.uploadGalleryImage);
router.get('/:eventId/gallery', eventController.getGalleryImages);

module.exports = router;
