const admin = require("firebase-admin");
const AWS = require("aws-sdk");
require("dotenv").config();
const awsConfig = require("../config/aws.config");
const { getExistingFileName, deleteSelfie } = require("../s3Utilitis");
const sharp = require("sharp");
const socket = require("../socket");

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
      const io = socket.getIo();

      if (!eventDoc.exists) {
        throw new Error("Event not found");
      }

      const eventData = eventDoc.data();
      const galleryImages = eventData.regularGallery || []; // Assuming `regularGallery` is an array of image URLs.

      // Check against the Current Image
      const imageId = `gallery_${file.originalname}`;
      const imageRef = `events/${eventId}/gallery/${imageId}`;

      if (galleryImages.includes(imageRef)) {
        // Image already exists, return or throw an error
        throw error("Image already exists in the gallery.");
      }

      // Process the image
      let processedBuffer;
      const imageFormat = file.mimetype.split("/")[1];

      switch (imageFormat) {
        case "jpeg":
          processedBuffer = await sharp(file.buffer)
            .rotate()
            .jpeg({ quality: 90 })
            .toBuffer();
          break;
        case "png":
          processedBuffer = await sharp(file.buffer)
            .rotate()
            .png({ quality: 90 })
            .toBuffer();
          break;
        default:
          processedBuffer = await sharp(file.buffer).rotate().png().toBuffer();
          break;
      }

      // Determine the Rekognition collection ID from the event document
      const rekognitionCollectionId = eventData.rekognitionCollectionId;

      // Upload the image to the Rekognition collection
      const { rekognition } = awsConfig;
      const rekognitionParams = {
        CollectionId: rekognitionCollectionId,
        ExternalImageId: imageId,
        DetectionAttributes: ["ALL"],
        Image: {
          Bytes: processedBuffer,
        },
      };

      const rekognitionResponse = await rekognition
        .indexFaces(rekognitionParams)
        .promise();

      // Retrieve the Rekognition image ID from the response
      const rekognitionImageId =
        rekognitionResponse.FaceRecords.length > 0
          ? rekognitionResponse.FaceRecords[0].Face.ImageId
          : null;

      if (rekognitionImageId) {
        await eventRef.update({
          regularGallery: admin.firestore.FieldValue.arrayUnion(imageRef),
          rekognitionIds:
            admin.firestore.FieldValue.arrayUnion(rekognitionImageId),
        });
      } else {
        await eventRef.update({
          regularGallery: admin.firestore.FieldValue.arrayUnion(imageRef),
        });
      }

      // Upload the image to the regular S3 bucket
      const regularS3BucketName = process.env.AWS_S3_RAW_BUCKET;
      const regularS3Key = `events/${eventId}/gallery/${imageId}`;

      // Determine the ContentType based on original or converted format
      const contentType = imageFormat === "raw" ? "image/png" : file.mimetype;

      const regularS3Params = {
        Bucket: regularS3BucketName,
        Key: regularS3Key,
        Body: processedBuffer,
        ContentEncoding: "base64",
        ContentType: contentType,
        CacheControl: "public, max-age=31536000",
      };

      await s3.upload(regularS3Params).promise();

      const imageUrl = `https://${regularS3BucketName}.s3.amazonaws.com/${regularS3Key}`;
      io.emit("new-image", { imageUrl: imageUrl });

      return rekognitionImageId;
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
      return eventId;
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  }

  static async getAll(userId) {
    try {
      const eventCollection = db.collection("events");
      const snapshot = await eventCollection
        .where("creatorId", "==", userId)
        .get();
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
      console.error("Error fetching events by user:", error);
      throw error;
    }
  }

  static async getGalleryImages(eventId) {
    try {
      const s3BucketName = process.env.AWS_S3_RAW_BUCKET;
      // You can construct the S3 key based on the eventId if needed
      // For example:
      const s3KeyPrefix = `events/${eventId}/gallery/`; // Adjust as needed

      const params = {
        Bucket: s3BucketName,
        Prefix: s3KeyPrefix, // Use a prefix to fetch all images for the event
      };

      const s3Objects = await s3.listObjectsV2(params).promise();

      // Extract the image objects and return them
      const galleryImages = s3Objects.Contents.map((object) => ({
        // You can include other metadata if needed
        imageKey: object.Key,
        // Optionally, you can construct URLs for the images if necessary
        imageUrl: `https://${s3BucketName}.s3.amazonaws.com/${object.Key}`,
      }));

      console.log("image Url: ", galleryImages);

      return galleryImages;
    } catch (error) {
      console.error("Error fetching gallery images from S3:", error);
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
    } catch (error) {
      console.error("Error granting access to event:", error);
      throw error;
    }
  }

  static async getUserEvents(userId) {
    try {
      const userEventsQuerySnapshot = await db.collection("accessedEvents")
        .where("userId", "==", userId)
        .get();
  
      // Check if the query returned any documents
      if (!userEventsQuerySnapshot.empty) {
        const events = [];
  
        // Iterate over each document and fetch the event details
        for (const doc of userEventsQuerySnapshot.docs) {
          const eventId = doc.id.split('_')[1]; // Assuming the document ID is in the format 'userId_eventId'
  
          const eventRef = db.collection("events").doc(eventId);
          const eventSnapshot = await eventRef.get();
  
          if (eventSnapshot.exists) {
            const eventData = eventSnapshot.data();
  
            // Check if the event's creatorId does not match the userId
            if (eventData.creatorId !== userId) {
              events.push({
                id: eventSnapshot.id,
                eventName: eventData.eventName,
                eventDateTime: eventData.eventDateTime,
                eventLocation: eventData.eventLocation,
                coverPhotoUrl: eventData.coverPhotoUrl,
              });
            } else {
              console.log(`Event with eventId: ${eventId} was created by the user and hence not added.`);
            }
          } else {
            console.log(`No event found for eventId: ${eventId}`); // Log when no event is found
          }
        }
  
        return events; // Return an array of events
      } else {
        console.log(`No accessed events found for user ${userId}`);
        return [];
      }
    } catch (error) {
      console.error("Error fetching user events:", error);
      throw error;
    }
  }
  
  
  

  static async deleteGalleryImage(eventId, imageId) {
    try {
        // Fetch the event document
        const eventRef = db.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            throw new Error('Event not found');
        }

        const eventData = eventDoc.data();
        const rekognitionIds = eventData.rekognitionIds || [];

        // For this example, we're assuming that the rekognition ID corresponds to the image ID.
        // If this isn't the case, you'll need to have a way to map from the image ID to the rekognition ID.
        const rekognitionImageId = rekognitionIds.find(id => id === imageId);

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
        console.error('Error deleting gallery image:', error);
        throw error;
    }
}

}

module.exports = Event;
