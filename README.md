# doordash-browse

Interactive terminal browser and spending reporter for DoorDash CLI.

```bash
npm install -g doordash-browse
```

## Quick start

```bash
# Rich TUI with inline images
doordash-browse

# Search restaurants
doordash-browse -q "ramen"

# Lightweight text-only mode
doordash-browse --lite

# Spending report (order history + receipts)
doordash-browse --spending --days 90
```

`doordash-browse` opens an interactive TUI for DoorDash. `--spending` runs spending breakdown by month and store.

## Spending report

```bash
doordash-browse --spending --days 30
```

`-d, --days <n>` sets history window (default: 90, max: 365). `--mock` runs offline test mode.

## Options

- `-q, --query <text>` Search query
- `-n, --nearby` Browse nearby stores instead of restaurants
- `-l, --lite` Lightweight text-only mode (no inline images)
- `-s, --spending` Run spending report
- `-d, --days <n>` Days of history for spending report (default: 90)
- `-h, --help` Show help

## Requirements

Requires [dd-cli](https://github.com/hemanth/dd-cli) installed and logged in (`dd-cli login`).

## License

MIT © [Hemanth.HM](https://h3manth.com)
