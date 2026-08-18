import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skip = new Set(['node_modules', '.next', '.git']);
let removed = 0;
let patched = 0;
let scanned = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    scanned++;
    const rel = path.relative(root, full).replaceAll('\\', '/');

    // Windows / browser duplicate route files such as route (1).ts are never valid Next API routes.
    if (/^route \(\d+\)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      console.log(`[MF prebuild] removing duplicate route file: ${rel}`);
      fs.unlinkSync(full);
      removed++;
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    let text = fs.readFileSync(full, 'utf8');
    const before = text;
    text = text
      .replaceAll('staff_name:staff.name', "staff_name:String(staff?.name ?? '')")
      .replaceAll('staff_name: staff.name', "staff_name: String(staff?.name ?? '')");
    if (text !== before) {
      fs.writeFileSync(full, text, 'utf8');
      console.log(`[MF prebuild] patched stale staff.name null access: ${rel}`);
      patched++;
    }
  }
}

console.log('[MF prebuild] sanity check v2.7.1c START');
walk(root);
console.log(`[MF prebuild] scanned=${scanned}, removed_duplicate_routes=${removed}, patched_stale_staff_access=${patched}`);
console.log('[MF prebuild] sanity check v2.7.1c END');
