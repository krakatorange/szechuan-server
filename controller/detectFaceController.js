const { rekognition, s3 } = require('../config/aws.config');
require('dotenv').config();

const detectFaceController = {
    detectFace: async (req, res) => {
        try {
            const userId = req.body.userId;
            const eventId = req.body.eventId;
    
            console.log('Received request with userId:', userId);
            console.log('Received request with eventId:', eventId);
    
            // Construct S3 bucket name and object key for the folder
            const s3SelfiesBucket = process.env.AWS_S3_SELFIES_BUCKET;
            const s3RawBucket = process.env.AWS_S3_RAW_BUCKET;
            const folderPath = `selfies/${userId}/`;
    
            console.log('Constructed S3 selfies bucket name:', s3SelfiesBucket);
            console.log('Constructed S3 raw bucket name:', s3RawBucket);
            console.log('Constructed S3 folder path:', folderPath);
    
            // List objects in the specified folder in the raw bucket
            const listObjectsParams = {
                Bucket: s3SelfiesBucket,
                Prefix: folderPath,
            };
    
            const listObjectsResponse = await s3.listObjectsV2(listObjectsParams).promise();
    
            // Extract the list of object keys (filenames) from the response
            const objectKeys = listObjectsResponse.Contents.map((obj) => obj.Key);
    
            // Assuming you want to use the first filename, you can access it like this:
            const firstFilename = objectKeys[0];
    
            const collectionId = `szechuan_event_${eventId}`;
    
            /* This operation searches for faces in a Rekognition collection that match a face in an S3 bucket. */
            const params = {
                CollectionId: collectionId,
                FaceMatchThreshold: 95,
                Image: {
                    S3Object: {
                        Bucket: s3SelfiesBucket, // Use the selfies bucket for comparison
                        Name: firstFilename,
                    },
                },
                MaxFaces: 5,
            };
    
            console.log('Search faces parameters:', params);
    
            // Use the Rekognition service to search for faces
            const data = await rekognition.searchFacesByImage(params).promise();
    
            console.log('Face search result:', data);
    
            // Check if there are any matching faces
            if (data.FaceMatches && data.FaceMatches.length > 0) {
                console.log('Matching face(s) found!');
    
                // Iterate through the matching faces
                for (const match of data.FaceMatches) {
                    const faceImageKey = match.Face.ExternalImageId;
                    console.log("Face Image Key:", faceImageKey);
    
                    // Define the destination bucket (s3-matches) and key
                    const destinationBucket = process.env.AWS_S3_MATCHES_BUCKET;
                    const destinationKey = `events/${eventId}/users/${userId}/${faceImageKey}`;
                    const rawbucketURL = `events/${eventId}/gallery/${faceImageKey}`
                    const matchedImageUrl = `https://${s3RawBucket}.s3.amazonaws.com/${rawbucketURL}`;
    
                    // Copy the matched image from the raw bucket to the matches bucket
                    try {
                        // Copy the matched image from the raw bucket to the matches bucket
                        const copyParams = {
                            Bucket: destinationBucket,
                            CopySource: matchedImageUrl, // Use the raw bucket source
                            Key: destinationKey,
                        };
                    
                        await s3.copyObject(copyParams).promise();
                    
                        console.log(`Matched image copied to szechuan-matches: ${destinationKey}`);
                    } catch (copyError) {
                        console.error('Error copying image:', copyError);
                        // Add additional logging to help identify the issue
                        console.log('Destination Bucket:', destinationBucket);
                        console.log('Destination Key:', destinationKey);
                        console.log('Matched Image URL:', matchedImageUrl);
                    }
                }
            } else {
                console.log('No matching faces found.');
            }
    
            return res.status(200).json({ message: 'Face detection and matching completed.' });
        } catch (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'An error occurred' });
        }
    },
    
    getMatchedImages: async (req, res) => {
        try {
            const userId = req.params.userId; // Get userId from the request
            const eventId = req.params.eventId; // Get eventId from the request

            const destinationBucket = process.env.AWS_S3_MATCHES_BUCKET;
            const destinationPrefix = `events/${eventId}/users/${userId}/`;

            const listObjectsParams = {
                Bucket: destinationBucket,
                Prefix: destinationPrefix,
            };

            const listObjectsResponse = await s3.listObjectsV2(listObjectsParams).promise();

            // Extract the list of object keys (image URLs) from the response
            const matchedImageUrls = listObjectsResponse.Contents.map((obj) => ({
                matchedImageUrl: `https://${destinationBucket}.s3.amazonaws.com/${obj.Key}`,
            }));

            // Send the matched images as a JSON response
            res.status(200).json(matchedImageUrls);
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ error: 'An error occurred' });
        }
    },
};

module.exports = detectFaceController;
