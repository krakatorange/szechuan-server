const { rekognition } = require('../config/aws.config');
require('dotenv').config();

const detectFaceController = {
    detectFace: async (req, res) => {
        try {
            const userId = req.body.userId;
            const eventId = req.body.eventId;
            
            /* This operation searches for faces in a Rekognition collection that match a face in an S3 bucket. */
            var params = {
                CollectionId: eventId, // each event has its own collection
                FaceMatchThreshold: 95,
                Image: {
                    S3Object: {
                        Bucket: process.env.AWS_S3_SELFIES_BUCKET,
                        Name: userId // each user has 1 selfie
                    }
                },
                MaxFaces: 5
            };
            rekognition.searchFacesByImage(params, function(err, data) {
                if (err) {
                    console.log(err, err.stack);
                } // an error occurred
                else {
                    console.log(data);
                } // successful response
            });
        } catch (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'An error occurred' });
        }
    }
}

module.exports = detectFaceController;