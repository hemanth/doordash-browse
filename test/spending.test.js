import test from 'node:test';
import assert from 'node:assert/strict';
import { spendingReport } from '../spending.js';

test('spendingReport with mock option runs and prints clean report', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    await spendingReport({ days: 90, mock: true });
    const output = logs.join('\n');

    assert.match(output, /DoorDash Spending Report/);
    assert.match(output, /6 orders found/);
    assert.match(output, /Surya Darshini/);
    assert.match(output, /Cold Stone Creamery/);
    assert.match(output, /Total:.*\$419\.75.*across 6 orders/);
    assert.match(output, /Average per order: \$69\.96/);
  } finally {
    console.log = originalLog;
  }
});
