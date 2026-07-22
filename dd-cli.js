import { execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Run a dd-cli command synchronously and return the parsed structuredContent.
 * @param {string[]} args - dd-cli arguments (e.g. ['search', '--query', 'ramen'])
 * @returns {object} parsed structuredContent from dd-cli JSON output
 */
export function runDdCli(args) {
  const cmd = ['dd-cli', '--json-output', ...args].join(' ');
  const raw = execSync(cmd, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  const parsed = JSON.parse(raw);
  return parsed.structuredContent || parsed;
}

/**
 * Run a dd-cli command asynchronously (non-blocking).
 * @param {string[]} args
 * @returns {Promise<object>}
 */
export async function runDdCliAsync(args) {
  const cmd = ['dd-cli', '--json-output', ...args].join(' ');
  const { stdout } = await execAsync(cmd, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  const parsed = JSON.parse(stdout);
  return parsed.structuredContent || parsed;
}

/**
 * Search for restaurants.
 * @param {string} query - Search query
 * @returns {object} structuredContent with stores[]
 */
export function searchRestaurants(query) {
  return runDdCli(['search', '--query', JSON.stringify(query)]);
}

/**
 * Find nearby stores (grocery, retail, etc.).
 * @param {object} opts
 * @param {string} [opts.vertical='grocery']
 * @param {number} [opts.max=10]
 * @returns {object} structuredContent with stores[]
 */
export function findNearbyStores(opts = {}) {
  const args = ['find-nearby-stores'];
  if (opts.vertical) args.push('--vertical', opts.vertical);
  if (opts.max) args.push('--max', String(opts.max));
  if (opts.lat) args.push('--lat', String(opts.lat));
  if (opts.lng) args.push('--lng', String(opts.lng));
  return runDdCli(args);
}

/**
 * Get menu for a store (async, non-blocking).
 * @param {string} storeId
 * @returns {Promise<object>} menu data
 */
export async function getMenuAsync(storeId) {
  return runDdCliAsync(['menu', '--store-id', storeId]);
}

/**
 * Get menu for a store (sync, blocking).
 * @param {string} storeId
 * @returns {object} menu data
 */
export function getMenu(storeId) {
  return runDdCli(['menu', '--store-id', storeId]);
}

/**
 * Get store details.
 * @param {string} storeId
 * @returns {object} store details
 */
export function getStoreDetails(storeId) {
  return runDdCli(['store-details', '--store-id', storeId]);
}

/**
 * Get order history (async).
 * @param {object} opts
 * @param {number} [opts.days=90]
 * @param {number} [opts.max=100]
 * @returns {Promise<object>}
 */
export async function getOrderHistoryAsync(opts = {}) {
  const args = ['order', 'history'];
  args.push('--days', String(opts.days || 90));
  args.push('--max', String(opts.max || 100));
  return runDdCliAsync(args);
}

/**
 * Get receipt for an order (async).
 * @param {string} orderUuid
 * @returns {Promise<object>}
 */
export async function getReceiptAsync(orderUuid) {
  return runDdCliAsync(['order', 'receipt', '--order-uuid', orderUuid]);
}
