const admin = require("firebase-admin");
const AWS = require("aws-sdk");
require("dotenv").config();
const awsConfig = require("../config/aws.config");
const { getExistingFileName, deleteSelfie } = require("../s3Utilitis");
const sharp = require("sharp");
const socket = require("../socket");
const { PassThrough } = require('stream');

admin.initializeApp({
  credential: admin.credential.cert({
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"), // this is a string with \
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore(); // Initialize Firestore
const s3 = awsConfig.s3; //Intialize AWS S3

class Event {
  static async uploadCoverPhoto(file) {
    try {
      const bucket = admin.storage().bucket();
      const fileName = `cover_photos/${Date.now()}_${file.originalname}`;
      const fileRef = bucket.file(fileName);

      await fileRef.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          cacheControl: "public, max-age=31536000", // Optional: Set caching headers
        },
      });

      const coverPhotoUrl = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(fileName)}?alt=media`;
      return coverPhotoUrl;
    } catch (error) {
      console.error("Error uploading cover photo:", error);
      throw error;
    }
  }

  static async uploadSelfie(userId, file) {
    try {
      // Define the S3 bucket name for selfies
      const selfieS3BucketName = process.env.AWS_S3_SELFIES_BUCKET;

      // Check if the user already has an image
      const existingFileName = await getExistingFileName(userId);

      // If the user has an existing image, delete it
      if (existingFileName) {
        await deleteSelfie(userId, existingFileName);
      }

      // Generate a unique filename for the new selfie image
      const fileName = `selfies/${userId}/${Date.now()}_${file.originalname}`;

      // Create params for uploading to the selfie S3 bucket
      const params = {
        Bucket: selfieS3BucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000", // Optional: Set caching headers
      };

      // Upload the new image to the selfie S3 bucket
      await s3.upload(params).promise();

      // Generate the S3 URL for the new image
      const imageUrl = `https://${selfieS3BucketName}.s3.amazonaws.com/${encodeURIComponent(
        fileName
      )}`;

      // Return the URL of the uploaded selfie image
      return { imageUrl };
    } catch (error) {
      console.error("Error uploading selfie image:", error);
      throw error;
    }
  }

  static async uploadGalleryImage(eventId, file) {
    try {
      // Fetch the Image URLs from Firestore
      const eventRef = db.collection("events").doc(eventId);
      const eventDoc = await eventRef.get();
      const timestamp = new Date().toISOString();
      const io = socket.getIo();

      if (!eventDoc.exists) {
        throw new Error("Event not found");
      }

      const eventData = eventDoc.data();
      const galleryImages = eventData.regularGallery || [];
      const imageId = `gallery_${file.originalname}`;
      const imageRef = `events/${eventId}/gallery/${imageId}`;

      if (galleryImages.includes(imageRef)) {
        throw new Error("Image already exists in the gallery.");
      }

      // Process the image for Rekognition (compressed)
      let rekognitionBuffer = await sharp(file.buffer)
        .resize(800)
        .jpeg({ quality: 70 }) 
        .toBuffer();

      // Upload compressed image to rekognition bucket
      const rekognitionS3BucketName = process.env.AWS_S3_REKOGNITION_BUCKET;
      const rekognitionS3Key = `events/${eventId}/gallery/${imageId}`;
      
      await s3.upload({
        Bucket: rekognitionS3BucketName,
        Key: rekognitionS3Key,
        Body: rekognitionBuffer,
        ContentType: 'image/jpeg',
        CacheControl: "public, max-age=31536000",
      }).promise();

      const rekognitionImageUrl = `https://${rekognitionS3BucketName}.s3.amazonaws.com/${rekognitionS3Key}`;

      // Rekognition Service to detect faces
      const {rekognition} = awsConfig;
      const rekognitionParams = {
        CollectionId: eventData.rekognitionCollectionId,
        ExternalImageId: imageId,
        DetectionAttributes: ["ALL"],
        Image: { 
          S3Object: { 
            Bucket: rekognitionS3BucketName, 
            Name: rekognitionS3Key 
          } 
        },
      };

      const rekognitionResponse = await rekognition
        .indexFaces(rekognitionParams)
        .promise();
      const rekognitionImageId = rekognitionResponse.FaceRecords.length > 0
        ? rekognitionResponse.FaceRecords[0].Face.ImageId
        : null;

      // Upload original image to regular bucket using multipart upload
      const regularS3BucketName = process.env.AWS_S3_RAW_BUCKET;
      const regularS3Key = `events/${eventId}/gallery/${imageId}`;
      
      // Assuming file.buffer is a Buffer of your original image
      const pass = new PassThrough();
      pass.end(file.buffer);
      await s3.upload({
        Bucket: regularS3BucketName,
        Key: regularS3Key,
        Body: pass,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000",
      }).promise();

      const imageUrl = `https://${regularS3BucketName}.s3.amazonaws.com/${regularS3Key}`;

      // Update the event document in Firestore
      const updateObject = {
        regularGallery: admin.firestore.FieldValue.arrayUnion({
          imageRef: imageRef,
          timestamp: timestamp,
          rekognitionImageId: rekognitionImageId ? rekognitionImageId : null,
        }),
      };

      await eventRef.update(updateObject);

      // Emit the new image URL to update clients in real-time
      io.emit("new-image", { imageUrl: imageUrl });

      // Return the Rekognition Image ID and the URL to the full-quality image
      return { rekognitionImageId, imageUrl, timestamp };
    } catch (error) {
      console.error("Error uploading gallery image:", error);
      throw error;
    }
  }

  static async createEvent(
    eventName,
    eventDateTime,
    eventLocation,
    coverPhoto,
    creatorId
  ) {
    const io = socket.getIo();
    try {
      const coverPhotoUrl = await this.uploadCoverPhoto(coverPhoto);

      // Create a new document in Firestore
      const eventRef = db.collection("events").doc();
      const eventId = eventRef.id;

      // Create a corresponding Rekognition collection for the event
      const { rekognition } = awsConfig;

      const rekognitionParams = {
        CollectionId: `szechuan_event_${eventId}`, // Use a unique collection ID for each event
      };

      // Attempt to create the Rekognition collection
      try {
        await rekognition.createCollection(rekognitionParams).promise();
        console.log(
          `Rekognition collection '${rekognitionParams.CollectionId}' created successfully`
        );
      } catch (rekognitionError) {
        console.error(
          "Error creating Rekognition collection:",
          rekognitionError
        );
        throw rekognitionError;
      }

      // Update the event document with the collection ID
      await eventRef.set({
        eventName,
        eventDateTime,
        eventLocation,
        coverPhotoUrl,
        creatorId,
        rekognitionCollectionId: rekognitionParams.CollectionId,
      });

      console.log("Event created successfully");
      // Inside your createEvent method, after the event is successfully created
      io.emit("event-created", {
        eventId,
        eventName,
        eventDateTime,
        eventLocation,
        coverPhotoUrl,
        creatorId,
      });

      return eventId;
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  }

  static async editEvent(
    eventId,
    eventName,
    eventDateTime,
    eventLocation,
    coverPhoto
  ) {
    const io = socket.getIo();
    try {
      let coverPhotoUrl;

      // Only upload a new cover photo if one is provided
      if (coverPhoto) {
        coverPhotoUrl = await this.uploadCoverPhoto(coverPhoto);
      }

      // Reference the existing document in Firestore
      const eventRef = db.collection("events").doc(eventId);

      // Check if the event exists before updating
      const eventSnapshot = await eventRef.get();
      if (!eventSnapshot.exists) {
        throw new Error("Event not found.");
      }

      // Prepare the update data object
      const updateData = {
        eventName,
        eventDateTime,
        eventLocation,
        // Do not include creatorId in the update
      };

      // If a new cover photo was uploaded, add it to the update data
      if (coverPhotoUrl) {
        updateData.coverPhotoUrl = coverPhotoUrl;
      }

      // Update the event document
      await eventRef.update(updateData);

      console.log("Event updated successfully");

      // Emit an event using socket.io to notify about the event update
      io.emit("event-updated", {
        eventId,
        ...updateData,
      });

      return eventId;
    } catch (error) {
      console.error("Error updating event:", error);
      throw error;
    }
  }

  static async getGalleryImages(eventId) {
    try {
      const eventRef = db.collection("events").doc(eventId);
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new Error("Event not found");
      }

      const eventData = eventDoc.data();
      const firestoreGalleryImages = eventData.regularGallery || [];

      const s3BucketName = process.env.AWS_S3_RAW_BUCKET;
      const s3KeyPrefix = `events/${eventId}/gallery/`;

      const params = {
        Bucket: s3BucketName,
        Prefix: s3KeyPrefix,
      };

      const s3Objects = await s3.listObjectsV2(params).promise();
      const s3GalleryImages = s3Objects.Contents.map((object) => ({
        imageKey: object.Key,
        imageUrl: `https://${s3BucketName}.s3.amazonaws.com/${object.Key}`,
      }));

      // Merge Firestore timestamps with S3 image URLs
      const mergedGalleryImages = s3GalleryImages.map((s3Image) => {
        const firestoreImage = firestoreGalleryImages.find(
          (fsi) => fsi.imageRef === s3Image.imageKey
        );
        return {
          ...s3Image,
          timestamp: firestoreImage ? firestoreImage.timestamp : null,
        };
      });

      console.log("Merged gallery images: ", mergedGalleryImages);

      return mergedGalleryImages;
    } catch (error) {
      console.error("Error fetching gallery images:", error);
      throw error;
    }
  }

  static async getSelfieImageURL(userId) {
    try {
      const s3BucketName = process.env.AWS_S3_SELFIES_BUCKET;
      // You can construct the S3 key based on the eventId if needed
      // For example:
      const s3KeyPrefix = `selfies/${userId}/`; // Adjust as needed

      const params = {
        Bucket: s3BucketName,
        Prefix: s3KeyPrefix, // Use a prefix to fetch all images for the event
      };

      const s3Objects = await s3.listObjectsV2(params).promise();

      // Extract the image objects and return them
      const SelfieImages = s3Objects.Contents.map((object) => ({
        // You can include other metadata if needed
        imageKey: object.Key,
        // Optionally, you can construct URLs for the images if necessary
        imageUrl: `https://${s3BucketName}.s3.amazonaws.com/${object.Key}`,
      }));

      return SelfieImages;
    } catch (error) {
      console.error("Error fetching gallery images from S3:", error);
      throw error;
    }
  }

  static async grantAccessToEvent(userId, eventId, galleryUrl) {
    const io = socket.getIo();
    try {
      // Check if the user already has access to this event
      const accessRecordRef = db
        .collection("accessedEvents")
        .doc(`${userId}_${eventId}`);
      const accessRecordSnapshot = await accessRecordRef.get();

      if (accessRecordSnapshot.exists) {
        // The user already has access, no need to grant access again
        console.log(`User ${userId} already has access to event ${eventId}`);
        return;
      }

      // Create a new document in the "accessedEvents" collection
      await accessRecordRef.set({
        userId: userId,
        eventId: eventId,
        galleryUrl: galleryUrl, // Include the gallery URL
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Access granted to user ${userId} for event ${eventId}`);
      // Inside your grantAccessToEvent method, after access is successfully granted
      io.emit("access-granted", { userId, eventId, galleryUrl });
    } catch (error) {
      console.error("Error granting access to event:", error);
      throw error;
    }
  }

  static async getUserAndAccessedEvents(userId) {
    const io = socket.getIo();
    try {
      const events = [];

      // Create promises for both queries
      const createdEventsPromise = db
        .collection("events")
        .where("creatorId", "==", userId)
        .get();
      const accessedEventsPromise = db
        .collection("accessedEvents")
        .where("userId", "==", userId)
        .get();

      // Use Promise.all to run both queries in parallel
      const [createdEventsSnapshot, accessedEventsSnapshot] = await Promise.all(
        [createdEventsPromise, accessedEventsPromise]
      );

      // Process the snapshot for created events
      createdEventsSnapshot.forEach((doc) => {
        const data = doc.data();
        events.push({
          id: doc.id,
          eventName: data.eventName,
          eventDateTime: data.eventDateTime,
          eventLocation: data.eventLocation,
          coverPhotoUrl: data.coverPhotoUrl,
          isCreatedByUser: true, // flag indicating this is a created event
        });
      });

      // Process the snapshot for accessed events
      // First, gather all eventIds
      const eventIds = accessedEventsSnapshot.docs.map(
        (doc) => doc.id.split("_")[1]
      ); // Assuming the doc ID is 'userId_eventId'

      // Then, fetch all events in a single batch query
      const eventsRef = db.collection("events");
      const eventSnapshotsPromises = eventIds.map((eventId) =>
        eventsRef.doc(eventId).get()
      );
      const eventSnapshots = await Promise.all(eventSnapshotsPromises);

      // Finally, process the fetched event snapshots
      eventSnapshots.forEach((eventSnapshot) => {
        if (eventSnapshot.exists) {
          const eventData = eventSnapshot.data();

          // If the event's creatorId doesn't match the userId, add the event
          if (eventData.creatorId !== userId) {
            events.push({
              id: eventSnapshot.id,
              eventName: eventData.eventName,
              eventDateTime: eventData.eventDateTime,
              eventLocation: eventData.eventLocation,
              coverPhotoUrl: eventData.coverPhotoUrl,
              isCreatedByUser: false, // flag indicating this is an accessed event
            });
          }
        }
      });

      io.emit("eventsData", { userId, events });

      return events;
    } catch (error) {
      console.error("Error fetching user and accessed events:", error);
      throw error;
    }
  }

  static async deleteEvent(eventId) {
    const io = socket.getIo();
    try {
      // Fetch the event document
      const eventRef = db.collection("events").doc(eventId);
      const eventDoc = await eventRef.get();
  
      if (!eventDoc.exists) {
        throw new Error("Event not found");
      }
  
      const eventData = eventDoc.data();
      const rekognitionIds = eventData.rekognitionIds || [];
      const rekognitionCollectionId = eventData.rekognitionCollectionId;
      const galleryImages = eventData.regularGallery || []; // Array of image objects.
  
      // Prepare AWS services
      const { rekognition } = awsConfig;
      const regularS3BucketName = process.env.AWS_S3_RAW_BUCKET;
  
      // Delete images from S3 in parallel
      const deleteImagePromises = galleryImages.map(imageObj => {
        if (typeof imageObj.imageRef !== 'string') {
          console.error('Invalid image reference:', imageObj.imageRef);
          return Promise.resolve(); // Resolve to skip invalid entries
        }
  
        const s3Key = imageObj.imageRef;
        const s3DeleteParams = {
          Bucket: regularS3BucketName,
          Key: s3Key,
        };
  
        return s3.deleteObject(s3DeleteParams).promise();
      });
  
      await Promise.all(deleteImagePromises);
  
      // Delete faces from Rekognition in batch (if supported)
      // Example code, adjust based on AWS SDK capabilities
      const rekognitionDeleteParams = {
        CollectionId: rekognitionCollectionId,
        FaceIds: rekognitionIds,
      };
      if (rekognitionIds.length > 0) {
        await rekognition.deleteFaces(rekognitionDeleteParams).promise();
      }
  
      // Delete the Rekognition collection
      const rekognitionCollectionDeleteParams = {
        CollectionId: rekognitionCollectionId,
      };
      await rekognition.deleteCollection(rekognitionCollectionDeleteParams).promise();
  
      // Delete the event from Firestore
      await eventRef.delete();
  
      console.log("Event deleted successfully");
      io.emit("event-deleted", { eventId: eventId });
    } catch (error) {
      console.error("Error deleting event:", error);
      throw error;
    }
  }
  

  static async deleteGalleryImage(eventId, imageId) {
    try {
      // Fetch the event document
      const eventRef = db.collection("events").doc(eventId);
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new Error("Event not found");
      }

      const eventData = eventDoc.data();
      const rekognitionIds = eventData.rekognitionIds || [];

      // For this example, we're assuming that the rekognition ID corresponds to the image ID.
      // If this isn't the case, you'll need to have a way to map from the image ID to the rekognition ID.
      const rekognitionImageId = rekognitionIds.find((id) => id === imageId);

      // If rekognitionImageId exists, then proceed with Rekognition deletion
      if (rekognitionImageId) {
        // Determine the Rekognition collection ID from the event document
        const rekognitionCollectionId = eventData.rekognitionCollectionId;

        // Delete the face from AWS Rekognition
        const { rekognition } = awsConfig;
        const rekognitionParams = {
          CollectionId: rekognitionCollectionId,
          FaceIds: [rekognitionImageId],
        };

        await rekognition.deleteFaces(rekognitionParams).promise();
      }

      // Delete the image from the S3 bucket
      const regularS3BucketName = process.env.AWS_S3_RAW_BUCKET;
      const regularS3Key = `events/${eventId}/gallery/${imageId}`;

      const s3DeleteParams = {
        Bucket: regularS3BucketName,
        Key: regularS3Key,
      };

      await s3.deleteObject(s3DeleteParams).promise();

      // Remove the image URL from Firestore
      await eventRef.update({
        regularGallery: admin.firestore.FieldValue.arrayRemove(regularS3Key),
      });
    } catch (error) {
      console.error("Error deleting gallery image:", error);
      throw error;
    }
  }
}

module.exports = Event;
