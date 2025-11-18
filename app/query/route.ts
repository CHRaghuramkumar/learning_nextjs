import { getDb } from '../lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const invoices = await db
      .collection('invoices')
      .aggregate([
        { $match: { amount: 666 } },
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_id',
            foreignField: 'id',
            as: 'customer',
          },
        },
        { $unwind: '$customer' },
        {
          $project: {
            _id: 0,
            amount: 1,
            customer: '$customer.name',
          },
        },
      ])
      .toArray();

    return Response.json(invoices);
  } catch (error) {
    console.error('Query Error:', error);
    return Response.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

