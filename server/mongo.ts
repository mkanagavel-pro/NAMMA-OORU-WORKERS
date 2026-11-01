import mongoose from 'mongoose';

let connected = false;

export async function connectMongo(): Promise<void> {
  if (connected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Namma Ooru Workers requires a MongoDB Atlas ' +
      '(or local MongoDB) connection string in .env - see .env.example.'
    );
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    // Fails fast instead of hanging silently if Atlas is unreachable
    // (wrong URI, IP not allow-listed, credentials wrong, etc.)
    serverSelectionTimeoutMS: 10000,
  });

  connected = true;
  console.log('MongoDB connected');

  mongoose.connection.on('error', (err: unknown) => {
    console.error('MongoDB connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    connected = false;
    console.warn('MongoDB disconnected');
  });
}

export function isMongoConnected(): boolean {
  return connected && mongoose.connection.readyState === 1;
}
