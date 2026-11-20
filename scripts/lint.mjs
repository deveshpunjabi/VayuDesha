/**
 * Zero-dependency static code-quality and security linter for VayuDesha.
 * Enforces `node --check` syntax validity, zero unsafe DOM/eval sinks,
 * zero empty catch blocks, zero merge conflict markers, and modular file bounds.
 */
import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCAN_DIRS = ['api', 'server', 'public', 'scripts', 'tests'];
const APP_DIRS = new Set(['api', 'server', 'public']);
const MAX_APP_FILE_LINES = 300;

const FORBIDDEN_PATTERNS = [
  { re: /^\s*debugger\s*;?/m, label: 'debugger statement' },
  { re: /^(?:<{7}|={7}|>{7})\s/m, label: 'Git merge conflict marker' },
  { re: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}|fbab562a[0-9a-f]{20,})\b/, label: 'hardcoded API secret' }
];

const APP_ONLY_FORBIDDEN = [
  { re: /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval)\b/, label: 'unsafe DOM or eval sink' },
  { re: /\bcatch\s*\{/, label: 'unbound empty catch {} block' }
];

async function collectCodeFiles(dirRel) {
  const fullDir = path.join(ROOT, dirRel);
  const entries = await readdir(fullDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relPath = path.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectCodeFiles(relPath)));
    } else if (/\.(?:mjs|js)$/.test(entry.name)) {
      files.push({ dir: dirRel.split(path.sep)[0], relPath, fullPath: path.join(ROOT, relPath) });
    }
  }
  return files;
}

async function runLint() {
  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...(await collectCodeFiles(dir)));
  }

  const errors = [];
  const summary = [];

  for (const file of allFiles) {
    try {
      execFileSync(process.execPath, ['--check', file.fullPath], { stdio: 'pipe' });
    } catch (err) {
      errors.push(`${file.relPath}: syntax check failed (${err.message})`);
    }

    const source = await readFile(file.fullPath, 'utf8');
    const lines = source.split(/\r?\n/).length;
    summary.push({ file: file.relPath.replaceAll('\\', '/'), dir: file.dir, lines });

    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.re.test(source)) errors.push(`${file.relPath}: contains forbidden ${rule.label}`);
    }

    if (APP_DIRS.has(file.dir)) {
      for (const rule of APP_ONLY_FORBIDDEN) {
        if (rule.re.test(source)) errors.push(`${file.relPath}: contains forbidden ${rule.label}`);
      }
      if (lines > MAX_APP_FILE_LINES) {
        errors.push(`${file.relPath}: ${lines} lines exceeds max ${MAX_APP_FILE_LINES} line modularity threshold`);
      }
    }
  }

  const appFiles = summary.filter(s => APP_DIRS.has(s.dir));
  const maxAppLines = Math.max(...appFiles.map(s => s.lines));
  console.log(`Linted ${allFiles.length} JS/MJS modules (${appFiles.length} app modules, max app file: ${maxAppLines} lines).`);
  for (const item of appFiles) {
    console.log(`  - ${item.file}: ${item.lines} lines`);
  }

  if (errors.length > 0) {
    for (const msg of errors) console.error(`LINT ERROR: ${msg}`);
    process.exit(1);
  }
}

await runLint();
