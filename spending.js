import { getOrderHistoryAsync, getReceiptAsync } from './dd-cli.js';

/**
 * Run a spending report and print it to stdout.
 * @param {object} opts
 * @param {number} [opts.days=90] - Time window in days
 */
export async function spendingReport(opts = {}) {
  const days = opts.days || 90;
  const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    gray: '\x1b[90m',
    white: '\x1b[37m',
  };

  console.log(`\n${c.cyan}${c.bold}DoorDash Spending Report${c.reset}  ${c.dim}(last ${days} days)${c.reset}\n`);

  // Support mock data for testing
  let data;
  if (opts.mock) {
    const mockOrders = [
      { order_uuid: 'mock-1', order_date: '2026-07-18T20:30:00Z', store_name: 'Cold Stone Creamery', fulfillment_type: 'DELIVERY', items: [{ name: 'Gotta Have It Tub', quantity: 2 }, { name: 'Waffle Cones', quantity: 4 }] },
      { order_uuid: 'mock-2', order_date: '2026-07-15T12:30:00Z', store_name: 'Surya Darshini', fulfillment_type: 'DELIVERY', items: [{ name: 'Set Dosa', quantity: 3 }, { name: 'Vada Sambar', quantity: 3 }] },
      { order_uuid: 'mock-3', order_date: '2026-07-10T18:45:00Z', store_name: 'Udupi Palace', fulfillment_type: 'DELIVERY', items: [{ name: 'Paneer Butter Masala', quantity: 2 }, { name: 'Garlic Naan', quantity: 6 }] },
      { order_uuid: 'mock-4', order_date: '2026-06-20T19:15:00Z', store_name: 'Bikanervala', fulfillment_type: 'PICKUP', items: [{ name: 'Raj Kachori', quantity: 3 }, { name: 'Chole Bhature', quantity: 3 }] },
      { order_uuid: 'mock-5', order_date: '2026-06-05T13:00:00Z', store_name: 'Saravanaa Bhavan', fulfillment_type: 'DELIVERY', items: [{ name: 'Idli Vada Combo', quantity: 4 }, { name: 'Special Thali', quantity: 2 }] },
      { order_uuid: 'mock-6', order_date: '2026-05-12T20:00:00Z', store_name: 'Surya Darshini', fulfillment_type: 'PICKUP', items: [{ name: 'Bisibelebath', quantity: 3 }, { name: 'Filter Coffee', quantity: 4 }] },
    ];
    const mockReceipts = new Map([
      ['mock-1', { payment_charge_details: [{ data: [{ net_amount: { unit_amount: 7020 }, payment_method: { brand: 'Visa', last4: '4242' } }] }] }],
      ['mock-2', { payment_charge_details: [{ data: [{ net_amount: { unit_amount: 7250 }, payment_method: { brand: 'Visa', last4: '4242' } }] }] }],
      ['mock-3', { payment_charge_details: [{ data: [{ net_amount: { unit_amount: 6980 }, payment_method: { brand: 'Amex', last4: '1001' } }] }] }],
      ['mock-4', { payment_charge_details: [{ data: [{ net_amount: { unit_amount: 7125 }, payment_method: { brand: 'Visa', last4: '4242' } }] }] }],
      ['mock-5', { payment_charge_details: [{ data: [{ net_amount: { unit_amount: 6850 }, payment_method: { brand: 'Visa', last4: '4242' } }] }] }],
      ['mock-6', { payment_charge_details: [{ data: [{ net_amount: { unit_amount: 6750 }, payment_method: { brand: 'Mastercard', last4: '8888' } }] }] }],
    ]);

    data = { orders: mockOrders };
    console.log(` ${mockOrders.length} orders found.\n`);
    var receipts = mockReceipts;
  } else {
    // Fetch order history
    process.stdout.write(`${c.gray}Fetching order history...${c.reset}`);
    try {
      data = await getOrderHistoryAsync({ days, max: 100 });
    } catch (e) {
      console.log(`\n${c.bold}Error:${c.reset} ${e.message}`);
      console.log(`${c.dim}Make sure you are logged in: dd-cli login${c.reset}`);
      process.exit(1);
    }

    const orders = data.orders || [];
    if (orders.length === 0) {
      console.log(`\n\nNo orders found in the last ${days} days.`);
      process.exit(0);
    }

    process.stdout.write(` ${orders.length} orders found.\n`);
    process.stdout.write(`${c.gray}Fetching receipts...${c.reset}`);

    // Fetch all receipts concurrently (in batches of 5 to be polite)
    var receipts = new Map();
    const BATCH = 5;
    for (let i = 0; i < orders.length; i += BATCH) {
      const batch = orders.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(o => getReceiptAsync(o.order_uuid).then(r => [o.order_uuid, r]))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [uuid, receipt] = r.value;
          receipts.set(uuid, receipt);
        }
      }
      process.stdout.write('.');
    }
    console.log(' done.\n');
  }

  const orders = data.orders || [];


  // Extract totals
  const byMonth = {};
  const byStore = {};
  const orderRows = [];
  let grandTotal = 0;

  for (const o of orders) {
    const receipt = receipts.get(o.order_uuid);
    let totalCents = 0;
    let payMethod = '';

    if (receipt) {
      for (const group of (receipt.payment_charge_details || [])) {
        for (const charge of (group.data || [])) {
          totalCents += (charge.net_amount?.unit_amount || 0);
          if (!payMethod && charge.payment_method) {
            const pm = charge.payment_method;
            payMethod = `${pm.brand || '?'} *${pm.last4 || '?'}`;
          }
        }
      }
    }

    const totalUsd = totalCents / 100;
    grandTotal += totalUsd;

    const date = o.order_date?.slice(0, 10) || '?';
    const month = o.order_date?.slice(0, 7) || '?';
    const store = o.store_name || '?';
    const type = (o.fulfillment_type || '').replace('FULFILLMENT_TYPE_', '').toLowerCase();

    byMonth[month] = (byMonth[month] || 0) + totalUsd;
    byStore[store] = (byStore[store] || 0) + totalUsd;

    const items = (o.items || []).map(i => `${i.name} x${i.quantity}`).join(', ');
    const itemsTrunc = items.length > 38 ? items.slice(0, 35) + '...' : items;

    orderRows.push({ date, store, items: itemsTrunc, total: totalUsd, type, payMethod });
  }

  // Print orders table
  console.log(`${c.bold}${'Date'.padEnd(12)} ${'Store'.padEnd(30)} ${'Items'.padEnd(40)} ${'Total'.padStart(8)}${c.reset}`);
  console.log(`${c.dim}${'-'.repeat(94)}${c.reset}`);

  for (const r of orderRows) {
    const totalStr = `$${r.total.toFixed(2)}`.padStart(8);
    const storeStr = r.store.slice(0, 28).padEnd(30);
    console.log(`${c.white}${r.date.padEnd(12)}${c.reset} ${storeStr} ${c.dim}${r.items.padEnd(40)}${c.reset} ${c.green}${totalStr}${c.reset}`);
  }

  console.log(`${c.dim}${'-'.repeat(94)}${c.reset}`);
  console.log(`${''.padEnd(12)} ${''.padEnd(30)} ${''.padEnd(40)} ${c.bold}${c.green}${'$' + grandTotal.toFixed(2)}${c.reset}`.padStart(8));

  // By month
  const sortedMonths = Object.keys(byMonth).sort();
  console.log(`\n${c.cyan}${c.bold}By month${c.reset}`);
  for (const m of sortedMonths) {
    const bar = '#'.repeat(Math.ceil(byMonth[m] / 10));
    console.log(`  ${c.white}${m}${c.reset}  ${c.green}${'$' + byMonth[m].toFixed(2).padStart(7)}${c.reset}  ${c.dim}${bar}${c.reset}`);
  }

  // By store
  const sortedStores = Object.entries(byStore).sort((a, b) => b[1] - a[1]);
  console.log(`\n${c.cyan}${c.bold}By store${c.reset}`);
  for (const [store, amt] of sortedStores) {
    const pct = ((amt / grandTotal) * 100).toFixed(0);
    console.log(`  ${c.white}${store.slice(0, 35).padEnd(37)}${c.reset} ${c.green}${'$' + amt.toFixed(2).padStart(7)}${c.reset}  ${c.dim}(${pct}%)${c.reset}`);
  }

  // Summary
  console.log(`\n${c.bold}Total: ${c.green}$${grandTotal.toFixed(2)}${c.reset}${c.bold} across ${orders.length} orders${c.reset}`);
  console.log(`${c.dim}Average per order: $${(grandTotal / orders.length).toFixed(2)}${c.reset}`);

  if (sortedMonths.length > 1) {
    const avg = grandTotal / sortedMonths.length;
    console.log(`${c.dim}Average per month: $${avg.toFixed(2)}${c.reset}`);
  }

  if (data.page_full) {
    console.log(`\n${c.yellow}Note: page was full -- there may be more orders. Try --days ${days} with a longer window.${c.reset}`);
  }

  console.log('');
}
