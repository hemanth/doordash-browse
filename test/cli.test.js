import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('CLI --help prints usage information', async () => {
  const { stdout } = await execFileAsync('node', ['./cli.js', '--help']);
  assert.match(stdout, /dd-browse - Interactive terminal browser for DoorDash CLI/);
  assert.match(stdout, /--spending/);
  assert.match(stdout, /--lite/);
});

test('CLI --spending --mock executes spending report', async () => {
  const { stdout } = await execFileAsync('node', ['./cli.js', '--spending', '--mock']);
  assert.match(stdout, /DoorDash Spending Report/);
  assert.match(stdout, /Cold Stone Creamery/);
  assert.match(stdout, /Surya Darshini/);
});
