const admin = require('firebase-admin');
require('dotenv').config();

admin.initializeApp({
  credential: admin.credential.cert({
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g,'\n') // this is a string with \
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore(); // Initialize Firestore

class Event {
  static async uploadCoverPhoto(file) {
    try {
      const bucket = admin.storage().bucket();
      const fileName = `cover_photos/${Date.now()}_${file.originalname}`;
      const fileRef = bucket.file(fileName);

      await fileRef.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          cacheControl: 'public, max-age=31536000', // Optional: Set caching headers
        },
      });

      const coverPhotoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
      return coverPhotoUrl;
    } catch (error) {
      console.error('Error uploading cover photo:', error);
      throw error;
    }
  }

  static async uploadGalleryImage(eventId, file) {
    try {
      const bucket = admin.storage().bucket();
      const fileName = `events/${eventId}/gallery/${Date.now()}_${file.originalname}`;
      const fileRef = bucket.file(fileName);
  
      await fileRef.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          cacheControl: 'public, max-age=31536000', // Optional: Set caching headers
        },
      });
  
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
  
      // Update the 'gallery' field in the event document
      const eventRef = db.collection('events').doc(eventId);
      await eventRef.update({
        gallery: admin.firestore.FieldValue.arrayUnion(imageUrl),
      });
  
      return imageUrl;
    } catch (error) {
      console.error('Error uploading gallery image:', error);
      throw error;
    }
  }
  
  static async createEvent(eventName, eventDateTime, eventLocation, coverPhoto, creatorId) {
    try {
      const coverPhotoUrl = await this.uploadCoverPhoto(coverPhoto);

      // Create a new document in Firestore
      const eventRef = db.collection('events').doc();
      const eventId = eventRef.id;
      await eventRef.set({
        eventName,
        eventDateTime,
        eventLocation,
        coverPhotoUrl,
        creatorId,
      });

      console.log('Event created successfully');
      return eventId;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  static async getAll(userId) {
    try {
      const eventCollection = db.collection('events');
      const snapshot = await eventCollection.where('creatorId', '==', userId).get();
      const events = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        events.push({
          id: doc.id,
          eventName: data.eventName,
          eventDateTime: data.eventDateTime,
          eventLocation: data.eventLocation,
          coverPhotoUrl: data.coverPhotoUrl,
        });
      });

      return events;
    } catch (error) {
      console.error('Error fetching events by user:', error);
      throw error;
    }
  }

  static async getGalleryImages(eventId) {
    try {
      const eventRef = db.collection('events').doc(eventId);
      const eventDoc = await eventRef.get();
  
      if (!eventDoc.exists) {
        return []; // Event not found
      }
  
      const eventData = eventDoc.data();
      return eventData.gallery || [];
    } catch (error) {
      console.error('Error fetching gallery images:', error);
      throw error;
    }
  }
}

module.exports = Event;
