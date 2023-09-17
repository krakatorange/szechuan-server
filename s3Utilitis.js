const AWS = require("aws-sdk");

// Initialize the AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

async function getExistingFileName(userId) {
  try {
    // Define the S3 bucket name for selfies
    const selfieS3BucketName = process.env.AWS_S3_SELFIES_BUCKET;

    // Use the AWS SDK to list objects in the S3 bucket
    const s3Objects = await s3
      .listObjectsV2({ Bucket: selfieS3BucketName })
      .promise();

    // Search for an object associated with the user's ID
    for (const object of s3Objects.Contents) {
      if (object.Key.startsWith(`selfies/${userId}/`)) {
        // Return the filename of the existing image
        return object.Key;
      }
    }

    // If no existing image is found, return null
    return null;
  } catch (error) {
    console.error("Error getting existing filename:", error);
    throw error;
  }
}

async function deleteSelfie(userId, fileName) {
  try {
    // Define the S3 bucket name for selfies
    const selfieS3BucketName = process.env.AWS_S3_SELFIES_BUCKET;

    // Create params for deleting the object from the S3 bucket
    const deleteParams = {
      Bucket: selfieS3BucketName,
      Key: fileName,
    };

    // Use the AWS SDK to delete the object from the S3 bucket
    await s3.deleteObject(deleteParams).promise();

    console.log(`Deleted selfie image for userId ${userId}: ${fileName}`);
  } catch (error) {
    console.error(
      `Error deleting selfie image for userId ${userId}: ${fileName}`,
      error
    );
    throw error;
  }
}

module.exports = {
  getExistingFileName,
  deleteSelfie,
};
