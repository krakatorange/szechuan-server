const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const eventRoutes = require('./routes/event.routes');
const AWS = require("aws-sdk");
require('dotenv').config();
const cors = require('cors');
const socket = require('./socket');  // Assuming you've created a separate socket.js module

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5001;

// Initialize the socket
socket.socketInit(server);

app.use(bodyParser.json());
app.use(cors());
app.use('/events', eventRoutes);

// Use the http server instance to listen instead of the express app
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});