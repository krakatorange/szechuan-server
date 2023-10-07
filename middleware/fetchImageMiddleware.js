const axios = require('axios');

async function fetchImageMiddleware(req, res) {
  try {
    const imageUrl = req.query.imageUrl;
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    res.contentType(response.headers['content-type']);
    res.send(response.data);
  } catch (error) {
    res.status(500).send("Error fetching image");
  }
}

module.exports = fetchImageMiddleware;
