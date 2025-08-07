const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 7008;

app.use(cors());
app.use(express.json());

const callYourAPI = async (profileUrl) => {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            url: profileUrl
        });

        const options = {
            hostname: 'localhost',
            port: 7007,
            path: '/api/linkedin/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'accept': '*/*',
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(new Error('Invalid JSON response from API'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
};

app.post('/api/linkedin/messages', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                error: 'Profile URL is required',
                message: 'Please provide a valid LinkedIn profile URL'
            });
        }
        
        const apiResponse = await callYourAPI(url);

        res.json(apiResponse);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
});
