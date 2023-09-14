const { rekognition, s3 } = require('../config/aws.config');

const detectFaceController = {
    detectFace: async (req, res) => {
        try {
            const userId = req.body.userId;
            const eventId = req.body.eventId;

            console.log('Received request with userId:', userId);
            console.log('Received request with eventId:', eventId);

            // Construct S3 bucket name and object key for the folder
            const s3BucketName = process.env.AWS_S3_SELFIES_BUCKET;
            const folderPath = `selfies/${userId}/`;

            console.log('Constructed S3 bucket name:', s3BucketName);
            console.log('Constructed S3 folder path:', folderPath);

            // List objects in the specified folder
            const listObjectsParams = {
                Bucket: s3BucketName,
                Prefix: folderPath, // Specify the folder path
            };

            const listObjectsResponse = await s3.listObjectsV2(listObjectsParams).promise();

            // Extract the list of object keys (filenames) from the response
            const objectKeys = listObjectsResponse.Contents.map((obj) => obj.Key);

            // Assuming you want to use the first filename, you can access it like this:
            const firstFilename = objectKeys[0];

            const collectionId = `szechuan_event_${eventId}`;

            /* This operation searches for faces in a Rekognition collection that match a face in an S3 bucket. */
            const params = {
                CollectionId: collectionId, // Each event has its own collection
                FaceMatchThreshold: 95, // Adjust the threshold as needed
                Image: {
                    S3Object: {
                        Bucket: s3BucketName,
                        Name: firstFilename, // Use the first filename from the list
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
                // You can process the matching faces here
            } else {
                console.log('No matching faces found.');
            }

            return res.status(200).json({ message: 'Face detection and matching completed.' });
        } catch (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'An error occurred' });
        }
    },
};

module.exports = detectFaceController;
