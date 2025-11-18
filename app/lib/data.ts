import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import { getDb } from './mongodb';

function buildSearchRegex(query: string) {
  if (!query) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

export async function fetchRevenue() {
  try {
    const db = await getDb();
    const data = await db.collection<Revenue>('revenue').find({}).toArray();
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const db = await getDb();
    const data = await db
      .collection('invoices')
      .aggregate<LatestInvoiceRaw>([
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_id',
            foreignField: 'id',
            as: 'customer',
          },
        },
        { $unwind: '$customer' },
        { $sort: { date: -1 } },
        { $limit: 5 },
        {
          $project: {
            id: '$id',
            amount: '$amount',
            name: '$customer.name',
            image_url: '$customer.image_url',
            email: '$customer.email',
          },
        },
      ])
      .toArray();

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    const db = await getDb();
    const invoicesCollection = db.collection('invoices');
    const customersCollection = db.collection('customers');

    const invoiceCountPromise = invoicesCollection.countDocuments();
    const customerCountPromise = customersCollection.countDocuments();
    const invoiceStatusPromise = invoicesCollection
      .aggregate<{ paid: number; pending: number }>([
        {
          $group: {
            _id: null,
            paid: {
              $sum: {
                $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0],
              },
            },
            pending: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0],
              },
            },
          },
        },
      ])
      .toArray();

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = data[0];
    const numberOfCustomers = data[1];
    const totals = data[2][0] ?? { paid: 0, pending: 0 };
    const totalPaidInvoices = formatCurrency(totals.paid ?? 0);
    const totalPendingInvoices = formatCurrency(totals.pending ?? 0);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  const searchRegex = buildSearchRegex(query);

  try {
    const db = await getDb();
    const pipeline: Record<string, unknown>[] = [
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
        $addFields: {
          amountString: { $toString: '$amount' },
          dateString: '$date',
        },
      },
    ];

    if (searchRegex) {
      pipeline.push({
        $match: {
          $or: [
            { 'customer.name': searchRegex },
            { 'customer.email': searchRegex },
            { status: searchRegex },
            { amountString: searchRegex },
            { dateString: searchRegex },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { date: -1 } },
      { $skip: offset },
      { $limit: ITEMS_PER_PAGE },
      {
        $project: {
          id: '$id',
          amount: '$amount',
          date: '$date',
          status: '$status',
          name: '$customer.name',
          email: '$customer.email',
          image_url: '$customer.image_url',
          customer_id: '$customer.id',
        },
      },
    );

    const invoices = await db
      .collection('invoices')
      .aggregate<InvoicesTable>(pipeline)
      .toArray();

    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const db = await getDb();
    const searchRegex = buildSearchRegex(query);

    const pipeline: Record<string, unknown>[] = [
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
        $addFields: {
          amountString: { $toString: '$amount' },
          dateString: '$date',
        },
      },
    ];

    if (searchRegex) {
      pipeline.push({
        $match: {
          $or: [
            { 'customer.name': searchRegex },
            { 'customer.email': searchRegex },
            { status: searchRegex },
            { amountString: searchRegex },
            { dateString: searchRegex },
          ],
        },
      });
    }

    pipeline.push({ $count: 'count' });

    const data = await db
      .collection('invoices')
      .aggregate<{ count: number }>(pipeline)
      .toArray();

    const totalPages = Math.ceil((data[0]?.count ?? 0) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const db = await getDb();
    const invoice = await db
      .collection<InvoiceForm>('invoices')
      .findOne({ id }, { projection: { _id: 0 } });

    if (!invoice) return null;

    return {
      ...invoice,
      amount: invoice.amount / 100,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const db = await getDb();
    const customers = await db
      .collection<CustomerField>('customers')
      .find({}, { projection: { id: 1, name: 1, _id: 0 } })
      .sort({ name: 1 })
      .toArray();
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const db = await getDb();
    const searchRegex = buildSearchRegex(query);

    const pipeline: Record<string, unknown>[] = [
      {
        $lookup: {
          from: 'invoices',
          localField: 'id',
          foreignField: 'customer_id',
          as: 'invoices',
        },
      },
      {
        $project: {
          id: 1,
          name: 1,
          email: 1,
          image_url: 1,
          total_invoices: { $size: '$invoices' },
          total_pending: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$invoices',
                    as: 'invoice',
                    cond: { $eq: ['$$invoice.status', 'pending'] },
                  },
                },
                as: 'invoice',
                in: '$$invoice.amount',
              },
            },
          },
          total_paid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$invoices',
                    as: 'invoice',
                    cond: { $eq: ['$$invoice.status', 'paid'] },
                  },
                },
                as: 'invoice',
                in: '$$invoice.amount',
              },
            },
          },
        },
      },
    ];

    if (searchRegex) {
      pipeline.push({
        $match: {
          $or: [{ name: searchRegex }, { email: searchRegex }],
        },
      });
    }

    pipeline.push({ $sort: { name: 1 } });

    const data = await db
      .collection('customers')
      .aggregate<CustomersTableType>(pipeline)
      .toArray();

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}
