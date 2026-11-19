import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let total = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
}
await walk(root);
console.log(`Repository source: ${(total / (1024 * 1024)).toFixed(3)} MiB (excluding Git history, dependencies & ignored build outputs)`);
if (total >= 9 * 1024 * 1024) process.exitCode = 1;
