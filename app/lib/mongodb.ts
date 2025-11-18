import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI environment variable is not set.');
}

const dbName = process.env.MONGODB_DB || 'nextjs-dashboard';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const client = new MongoClient(uri);
const clientPromise =
  process.env.NODE_ENV === 'production'
    ? client.connect()
    : global._mongoClientPromise || client.connect();

if (process.env.NODE_ENV !== 'production') {
  global._mongoClientPromise = clientPromise;
}

export async function getDb() {
  const mongoClient = await clientPromise;
  return mongoClient.db(dbName);
}

export type Db = Awaited<ReturnType<typeof getDb>>;

