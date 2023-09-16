// routes/eventRoutes.js
const express = require('express');
const router = express.Router();
const eventController = require('../controller/event.controller');
const detectFaceController = require('../controller/detectFaceController')
const multer = require('multer');
const storage = multer.memoryStorage(); // Store the file in memory as a buffer
const upload = multer({ storage: storage });

router.post('/create', upload.single('coverPhoto'), eventController.createEvent);
router.get('/all/:userId', eventController.getAllEvents);
router.post('/:eventId/upload', upload.single('galleryImage'), eventController.uploadGalleryImage);
router.get('/:eventId/gallery', eventController.getGalleryImages);
router.post('/:userId/selfie', upload.single('selfieImage'), eventController.uploadSelfie);
router.get('/getselfie/:userId', eventController.getSelfieImageURL);
router.post('/detect-face', detectFaceController.detectFace);
router.get('/matched/:userId/:eventId', detectFaceController.getMatchedImages);
router.post('/access/:eventId', eventController.grantAccessToEvent);

module.exports = router;
