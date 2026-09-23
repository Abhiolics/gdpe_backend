require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const seedInitialData = require('./utils/seedData');

const PORT = process.env.PORT || 5003;

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    await connectDB();
    await seedInitialData();

    const server = app.listen(PORT, () => {
      console.log(`=============================================`);
      console.log(`🚀 GDPE Backend Server running on port ${PORT}`);
      console.log(`🌐 Base URL: http://localhost:${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
      console.log(`=============================================`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error(`Unhandled Rejection Error: ${err.message}`);
      // Close server & exit process
      server.close(() => process.exit(1));
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
