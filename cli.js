#!/usr/bin/env node
import { render } from 'ink';
import React from 'react';
import App from './app.js';

// ── Parse args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let query = '';
let mode = 'search'; // 'search' | 'nearby'
let lite = false;
let spending = false;
let spendingDays = 90;
let spendingMock = false;

// Handle --help early (before any stdin reading)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  dd-browse - Interactive terminal browser for DoorDash CLI

  Usage:
    dd-browse                          Rich TUI with inline images (default)
    dd-browse --lite                   Lightweight text-only mode
    dd-browse -q "ramen"               Search restaurants for "ramen"
    dd-browse -l -q "pizza"            Lite mode search
    dd-browse -n                       Browse nearby grocery stores
    dd-browse -n -q "alcohol"          Browse nearby alcohol stores
    echo "sushi" | dd-browse           Pipe a search query

    dd-browse --spending               Spending report (last 90 days)
    dd-browse --spending --days 30     Spending this month
    dd-browse --spending --days 365    Spending this year

  Modes:
    --tui                 Rich TUI with inline images (default)
    -l, --lite            Lightweight text-only, no images, compact rows
    -s, --spending        Spending report (order history + receipts)

  Options:
    -q, --query <text>    Search query (or vertical for --nearby)
    -n, --nearby          Find nearby stores instead of restaurants
    -d, --days <n>        Days of history for --spending (default: 90, max: 365)
    -h, --help            Show this help

  Store list:
    Up/Down     Move selection
    Enter       View store details
    Type        Fuzzy filter results
    Esc         New search

  Store detail:
    Enter / m   Open menu
    Esc / b     Back to results

  Menu:
    Up/Down     Scroll items
    Tab         Cycle dietary filter (all, veg, vegan, gluten-free,
                dairy-free, spicy, seafood)
    Type        Fuzzy search menu items
    Esc         Back to store detail

  Requires: dd-cli installed and logged in (dd-cli login)
`);
  process.exit(0);
}

// Parse remaining flags
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--query' || args[i] === '-q') && args[i + 1]) {
    query = args[++i];
  } else if (args[i] === '--nearby' || args[i] === '-n') {
    mode = 'nearby';
  } else if (args[i] === '--lite' || args[i] === '-l') {
    lite = true;
  } else if (args[i] === '--tui') {
    lite = false;
  } else if (args[i] === '--spending' || args[i] === '-s') {
    spending = true;
  } else if (args[i] === '--mock') {
    spendingMock = true;
  } else if ((args[i] === '--days' || args[i] === '-d') && args[i + 1]) {
    spendingDays = parseInt(args[++i], 10) || 90;
  } else if (!query) {
    query = args[i];
  }
}

// ── Spending report (non-interactive, exits when done) ──────────────────────

if (spending) {
  const { spendingReport } = await import('./spending.js');
  await spendingReport({ days: spendingDays, mock: spendingMock });
  process.exit(0);
}

// ── Pipe support ────────────────────────────────────────────────────────────

if (!process.stdin.isTTY && !query) {
  const chunks = [];
  const timeout = new Promise(resolve => setTimeout(resolve, 200));
  const reading = new Promise(resolve => {
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', resolve);
  });
  await Promise.race([reading, timeout]);
  process.stdin.removeAllListeners();
  process.stdin.pause();

  if (chunks.length) {
    const pipeInput = Buffer.concat(chunks).toString('utf-8').trim();
    try {
      const parsed = JSON.parse(pipeInput);
      if (parsed.structuredContent?.stores) {
        query = parsed.structuredContent.query || '';
      }
    } catch {
      query = pipeInput;
    }
  }
}

// ── Render ──────────────────────────────────────────────────────────────────

render(React.createElement(App, { query, mode, lite }));
