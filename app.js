// server.js
const express = require('express');
const bodyParser = require('body-parser');
const eventRoutes = require('./routes/event.routes');
//const userRoutes = require('./routes/userRoutes')
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5001; // You can change this to your desired port

app.use(bodyParser.json());
app.use(cors());
app.use('/events', eventRoutes);
//app.use('/user', userRoutes)

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
