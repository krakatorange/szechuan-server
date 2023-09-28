let fetch;

import('node-fetch').then(nodeFetch => {
    fetch = nodeFetch.default;
}).catch(error => {
    console.error('Failed to load node-fetch:', error);
});

const corsProxyMiddleware = async (req, res) => {
    if (!fetch) {
        return res.status(500).json({ error: 'Internal server error - fetch not initialized' });
    }

    try {
        const { externalResourceUrl } = req.query;

        if (!externalResourceUrl) {
            throw new Error('External resource URL is missing');
        }

        const response = await fetch('https://captureoneliveshare-api-0e0132ffb41f.herokuapp.com/get_images/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'DVU2xAC48wkkISEftPCc5g',
            },
            body: JSON.stringify({ url: externalResourceUrl }),
        });

        if (response.status === 200) {
            const data = await response.json();
            console.log("API Response:", data); // Log the data from the API
            res.json(data);
        } else {
            console.error("API returned non-200 status:", response.status);
            res.status(response.status).json({ error: 'Failed to fetch external resource' });
        }
    } catch (error) {
        console.error('Error in corsProxyMiddleware:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = corsProxyMiddleware;
