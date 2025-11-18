import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { invoices, customers, revenue, users } from '../lib/placeholder-data';
import { Db, getDb } from '../lib/mongodb';

async function seedUsers(db: Db) {
  const collection = db.collection('users');
  await collection.deleteMany({});

  const docs = await Promise.all(
    users.map(async (user) => ({
      ...user,
      password: await bcrypt.hash(user.password, 10),
    })),
  );

  if (docs.length) {
    await collection.insertMany(docs);
  }
}

async function seedCustomers(db: Db) {
  const collection = db.collection('customers');
  await collection.deleteMany({});

  if (customers.length) {
    await collection.insertMany(customers);
  }
}

async function seedInvoices(db: Db) {
  const collection = db.collection('invoices');
  await collection.deleteMany({});

  const docs = invoices.map((invoice) => ({
    ...invoice,
    id: randomUUID(),
  }));

  if (docs.length) {
    await collection.insertMany(docs);
  }
}

async function seedRevenue(db: Db) {
  const collection = db.collection('revenue');
  await collection.deleteMany({});

  if (revenue.length) {
    await collection.insertMany(revenue);
  }
}

export async function GET() {
  try {
    const db = await getDb();
    await seedUsers(db);
    await seedCustomers(db);
    await seedInvoices(db);
    await seedRevenue(db);

    return Response.json({ message: 'Database seeded successfully' });
  } catch (error) {
    console.error('Seed Error:', error);
    return Response.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}
