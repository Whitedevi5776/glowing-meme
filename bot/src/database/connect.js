const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

let connected = false;

async function connectDB() {
  if (connected) return;

  let uri = config.mongodb.uri;

  if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
      connected = true;
      logger.info(`MongoDB connected -> ${uri}`);
      return;
    } catch {
      logger.warn('Local MongoDB not found - trying in-memory fallback...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        uri = mongod.getUri();
        logger.info('In-memory MongoDB started (data resets on restart)');
        logger.warn('Install mongodb-memory-server (npm install mongodb-memory-server) for this fallback.');
      } catch (e) {
        logger.error('MongoDB connection failed and in-memory fallback unavailable.');
        logger.error('Set MONGODB_URI in .env to a real MongoDB instance, or install mongodb-memory-server for dev.');
        process.exit(1);
      }
    }
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    connected = true;
    const display = uri.includes('@') ? uri.split('@').pop() : uri;
    logger.info(`MongoDB connected -> ${display}`);
  } catch (err) {
    logger.error('MongoDB connection failed: ' + err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
