// corsProxyMiddleware.js

const corsProxyMiddleware = async (req, res) => {
  try {
    // Get the external resource URL from the request query or body
    const { externalResourceUrl } = req.query; // Assuming it's sent as a query parameter

    if (!externalResourceUrl) {
      throw new Error('External resource URL is missing');
    }

    console.log('Fetching external resource from URL:', externalResourceUrl);

    // Make a request to the external resource
    const response = await fetch(externalResourceUrl);

    // Check if the response status is OK (200)
    if (response.status === 200) {
      // Get the content type of the response
      const contentType = response.headers.get('content-type');

      // Check if the content type indicates an image (e.g., 'image/jpeg', 'image/png', etc.)
      if (contentType && contentType.startsWith('image/')) {
        // Send the image binary data as the response to the client
        const imageBuffer = await response.buffer();
        res.setHeader('Content-Type', contentType);
        res.end(imageBuffer);
      } else {
        // If the content type is not an image, handle it accordingly (e.g., as JSON)
        const data = await response.json();
        res.json(data);
      }
    } else {
      // If the response status is not OK, send an error response
      res.status(response.status).json({ error: 'Failed to fetch external resource' });
    }
  } catch (error) {
    console.error('Error in corsProxyMiddleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = corsProxyMiddleware;
