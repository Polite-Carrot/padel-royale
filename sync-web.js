#!/usr/bin/env node
/* sync-web.js — mirror the game's web assets into www/ for Capacitor.
 *
 * Capacitor's `webDir` copies a folder wholesale into the native projects,
 * and the game lives at the repo root next to package.json and node_modules.
 * Rather than moving the game, this pulls only the files the page loads into
 * a clean www/ that Capacitor can copy from. Run before `npx cap sync`, or
 * use `npm run sync`, which does both. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'www');

// Everything the page loads: the page, its stylesheet, every ES module, the vendored libraries
// and the bundled fonts (with their licence).
const files = new Set(['index.html', 'styles.css']);
for (const dir of ['js', 'vendor']) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (name.endsWith('.js')) files.add(`${dir}/${name}`);
  }
}
for (const name of fs.readdirSync(path.join(root, 'fonts'))) files.add(`fonts/${name}`);

fs.rmSync(out, { recursive: true, force: true });
for (const rel of files) {
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dst);
}

console.log(`www/ populated with ${files.size} files`);
