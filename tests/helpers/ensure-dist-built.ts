import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const REQUIRED_DIST_FILES = [
  'cli/bin.mjs',
  'cli/main.mjs',
  'cli/main.d.mts',
  'cli/main.mjs.map',
  'cli/commands/_helpers.mjs',
  'cli/commands/_helpers.d.mts',
  'cli/commands/_helpers.mjs.map',
  'cli/commands/cleanup.mjs',
  'cli/commands/cleanup.d.mts',
  'cli/commands/cleanup.mjs.map',
  'lib/io.mjs',
  'lib/io.d.mts',
  'lib/io.mjs.map',
];

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function ensureDistBuilt(repoRoot: string): void {
  const distDir = path.join(repoRoot, 'dist');
  const hasRequiredFiles = () =>
    REQUIRED_DIST_FILES.every((relPath) => existsSync(path.join(distDir, relPath)));

  if (hasRequiredFiles()) return;

  const repoHash = createHash('sha1').update(repoRoot).digest('hex');
  const lockDir = path.join(tmpdir(), `jumpstart-dist-build-${repoHash}.lock`);

  while (true) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (err) {
      if (hasRequiredFiles()) return;
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      sleep(100);
    }
  }

  try {
    if (!hasRequiredFiles()) {
      execFileSync('npx', ['tsdown'], { cwd: repoRoot, stdio: 'pipe' });
    }
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}
