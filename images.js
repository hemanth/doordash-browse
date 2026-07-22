import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import got from 'got';
import terminalImage from 'terminal-image';

const imageCache = new Map();

// -- Terminal protocol detection ----------------------------------------------

function detectProtocol() {
  const env = process.env;
  if (env.ITERM_SESSION_ID || env.TERM_PROGRAM === 'iTerm.app') return 'iterm2';
  if (env.KITTY_PID || env.TERM === 'xterm-kitty') return 'kitty';
  if (env.TERM_PROGRAM === 'WezTerm') return 'iterm2';
  if (env.TERM_PROGRAM === 'ghostty') return 'kitty';
  if (env.TERM_PROGRAM === 'rio') return 'iterm2';
  return 'ansi';
}

function hasChafa() {
  try {
    execSync('which chafa', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const PROTOCOL = detectProtocol();
const HAS_CHAFA = PROTOCOL === 'ansi' && hasChafa();

// -- iTerm2 inline image protocol ---------------------------------------------

function iterm2Image(buffer, opts = {}) {
  const b64 = buffer.toString('base64');
  const params = [
    'inline=1',
    opts.width ? `width=${opts.width}` : '',
    opts.height ? `height=${opts.height}` : '',
    'preserveAspectRatio=1',
  ].filter(Boolean).join(';');
  return `\x1b]1337;File=${params}:${b64}\x07`;
}

// -- Kitty graphics protocol --------------------------------------------------

function kittyImage(buffer, opts = {}) {
  const b64 = buffer.toString('base64');
  const cols = opts.width || 40;
  const rows = opts.height || 20;
  const CHUNK = 4096;
  const chunks = [];
  for (let i = 0; i < b64.length; i += CHUNK) {
    chunks.push(b64.slice(i, i + CHUNK));
  }
  let result = '';
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    if (i === 0) {
      result += `\x1b_Ga=T,f=100,t=d,c=${cols},r=${rows},m=${isLast ? 0 : 1};${chunks[i]}\x1b\\`;
    } else {
      result += `\x1b_Gm=${isLast ? 0 : 1};${chunks[i]}\x1b\\`;
    }
  }
  return result;
}

// -- chafa rendering (high-quality ANSI art) ----------------------------------

function chafaImage(buffer, opts = {}) {
  const cols = opts.width || 60;
  const rows = opts.height || 24;
  const tmp = join(mkdtempSync(join(tmpdir(), 'dd-browse-')), 'img');
  try {
    writeFileSync(tmp, buffer);
    const output = execSync(
      `chafa --size=${cols}x${rows} --colors=256 --symbols=block+border+diagonal+dot+extra --color-space=din99d "${tmp}"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return output;
  } catch {
    return '';
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// -- Fetch and render ---------------------------------------------------------

/**
 * Fetch an image URL and render it for the terminal.
 * Priority: iTerm2 > Kitty > chafa > terminal-image ANSI blocks.
 *
 * @param {string} url
 * @param {object} opts
 * @param {number} [opts.width] - Width in terminal columns
 * @param {number} [opts.height] - Height in terminal rows
 * @returns {Promise<string>}
 */
export async function renderImage(url, opts = {}) {
  if (!url) return '';

  const width = opts.width || 40;
  const height = opts.height || 20;
  const cacheKey = `${PROTOCOL}_${url}_${width}_${height}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  let buffer;
  try {
    const resp = await got(url, {
      responseType: 'buffer',
      timeout: { request: 10000 },
    });
    buffer = resp.body;
  } catch {
    return '';
  }

  let rendered = '';
  try {
    if (PROTOCOL === 'iterm2') {
      rendered = iterm2Image(buffer, { width, height });
    } else if (PROTOCOL === 'kitty') {
      rendered = kittyImage(buffer, { width, height });
    } else if (HAS_CHAFA) {
      rendered = chafaImage(buffer, { width, height });
    } else {
      // Last resort: terminal-image ANSI half-blocks
      rendered = await terminalImage.buffer(buffer, {
        width: Math.max(width, 60),
        height: Math.max(height, 24),
        preserveAspectRatio: true,
      });
    }
  } catch {
    return '';
  }

  imageCache.set(cacheKey, rendered);
  return rendered;
}

/**
 * Batch-render multiple image URLs concurrently.
 * @param {string[]} urls
 * @param {object} opts
 * @returns {Promise<Map<string, string>>}
 */
export async function renderImages(urls, opts = {}) {
  const results = new Map();
  const unique = [...new Set(urls.filter(Boolean))];

  await Promise.allSettled(
    unique.map(async (url) => {
      const rendered = await renderImage(url, opts);
      results.set(url, rendered);
    })
  );

  return results;
}

/**
 * Returns the detected image protocol/renderer name.
 */
export function getProtocol() {
  if (HAS_CHAFA) return 'chafa';
  return PROTOCOL;
}
