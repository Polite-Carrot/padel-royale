import { execFileSync } from 'node:child_process';
import type { CapacitorConfig } from '@capacitor/cli';

/* Capacitor loads this before every `cap` command (sync, copy, update, open, run),
 * so www/ is always rebuilt from the current sources first and `npx cap sync`
 * alone can never ship a stale snapshot. */
try {
  execFileSync(process.execPath, ['sync-web.js'], { stdio: 'inherit', cwd: process.cwd() });
} catch (err) {
  console.error('capacitor.config.ts: sync-web.js failed:', (err as Error).message);
  process.exit(1);
}

const config: CapacitorConfig = {
  appId: 'com.politecarrot.padelroyale',
  appName: 'Padel Royale',
  webDir: 'www',
};

export default config;
