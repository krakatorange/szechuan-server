const socketIo = require('socket.io');

let io;
const origin_url = process.env.ORIGIN_URL

exports.socketInit = (server) => {
  io = socketIo(server, {
    cors: {
      origin: origin_url, // This is your client's origin. Adjust if necessary.
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('A user connected with socket id:', socket.id);

    socket.on('disconnect', () => {
      console.log('User disconnected with socket id:', socket.id);
    });

    // Additional debugging events
    socket.on('connect_error', (error) => {
      console.log('Connection Error:', error);
    });

    socket.on('connect_timeout', (timeout) => {
      console.log('Connection Timeout:', timeout);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after:', attemptNumber, 'attempts');
    });

    socket.on('reconnect_attempt', () => {
      console.log('Reconnect Attempted');
    });

    socket.on('reconnecting', (attemptNumber) => {
      console.log('Reconnecting. Attempt:', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
      console.log('Reconnection Error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.log('Reconnection Failed');
    });
  });
};

exports.getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
