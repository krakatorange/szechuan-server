const multer = require('multer');
const Event = require('../model/event.model');

// Configure Multer storage
const storage = multer.memoryStorage(); // Store the file in memory as a buffer
const upload = multer({ storage: storage });

const eventController = {
  createEvent: async (req, res) => {
    try {
      const { eventName, eventDateTime, eventLocation } = req.body;
      const coverPhoto = req.file;
      const creatorId = req.body.creatorId; // Assuming you have the user UID in the req.user object

      if (!eventName || !eventDateTime || !eventLocation || !coverPhoto) {
        return res.status(400).json({ error: 'Incomplete data' });
      }

      const eventId = await Event.createEvent(eventName, eventDateTime, eventLocation, coverPhoto, creatorId);

      return res.status(201).json({ message: 'Event created successfully', eventId });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  },

  uploadGalleryImage: async (req, res) => {
    try {
      const { eventId} = req.params;
      const galleryImage = req.file;

      if (!eventId || !galleryImage) {
        return res.status(400).json({ error: 'Incomplete data' });
      }

      const imageUrl = await Event.uploadGalleryImage(eventId, galleryImage);

      return res.status(201).json({ message: 'Gallery image uploaded successfully', imageUrl });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  },

  uploadSelfie: async (req, res) => {
    try {
      const { userId } = req.params;
      const selfieImage = req.file;

      if (!userId || !selfieImage) {
        return res.status(400).json({ error: 'Incomplete data' });
      }

      const imageUrl = await Event.uploadSelfie(userId, selfieImage);

      return res.status(201).json({ message: 'Selfie image uploaded successfully', imageUrl });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  },

  getGalleryImages: async (req, res) => {
    try {
      const { eventId } = req.params;

      if (!eventId) {
        return res.status(400).json({ error: 'Incomplete data' });
      }

      const galleryImages = await Event.getGalleryImages(eventId);

      return res.status(200).send(galleryImages);
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  },

  getAllEvents: async (req, res) => {
    try {
      const userId = req.params.userId; // Get the user ID from the URL parameters
      const events = await Event.getAll(userId);
  
      return res.status(200).json(events);
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  },

  getSelfieImageURL: async (req, res) => {
    try {
      const {userId} = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'Incomplete data' });
      }

      const imageUrl = await Event.getSelfieImageURL(userId);

      return res.status(200).json(imageUrl);
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  },
  grantAccessToEvent: async (req, res) => {
    try {
      const { userId } = req.body;
      const { eventId } = req.params; // Assuming you send userId and eventId in the request body
      if (!userId || !eventId) {
        return res.status(400).json({ error: 'Missing userId or eventId' });
      }
  
      await Event.grantAccessToEvent(userId, eventId);
  
      res.status(200).json({ message: `Access granted to user ${userId} for event ${eventId}` });
    } catch (error) {
      console.error('Error granting access:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = eventController;