import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const executable = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => candidate && existsSync(candidate));
if (!executable) throw new Error('Chrome is required to export icons. Set CHROME_BIN to its executable.');

const outputs = [
  { file: 'assets/icon-only.png', size: 1024, layer: 'icon' },
  { file: 'assets/play-store-icon.png', size: 512, layer: 'icon' },
  { file: 'assets/icon-foreground.png', size: 1024, layer: 'foreground' },
  { file: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', size: 1024, layer: 'icon' },
  { file: 'android/app/src/main/res/drawable-nodpi/ic_launcher_court.png', size: 432, layer: 'background' },
];
for (const [density, size, foregroundSize] of [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  outputs.push(
    { file: `${directory}/ic_launcher.png`, size, layer: 'icon' },
    { file: `${directory}/ic_launcher_round.png`, size, layer: 'round' },
    { file: `${directory}/ic_launcher_foreground.png`, size: foregroundSize, layer: 'foreground' },
  );
}

const source = await readFile(path.join(root, 'assets/icon.svg'), 'utf8');
const profile = await mkdtemp(path.join(tmpdir(), 'padel-icon-'));
const chrome = spawn(executable, [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
let messageId = 0;
let incoming = '';
const pending = new Map();
chrome.stdio[4].setEncoding('utf8');
chrome.stdio[4].on('data', (chunk) => {
  incoming += chunk;
  let boundary;
  while ((boundary = incoming.indexOf('\0')) !== -1) {
    const message = JSON.parse(incoming.slice(0, boundary));
    incoming = incoming.slice(boundary + 1);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome timed out: ${method}`));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const result = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const documentSvg = new DOMParser().parseFromString(${JSON.stringify(source)}, 'image/svg+xml');
      if (documentSvg.querySelector('parsererror')) throw new Error('Invalid icon SVG');
      const foregroundSvg = documentSvg.cloneNode(true);
      foregroundSvg.getElementById('background').remove();
      const backgroundSvg = documentSvg.cloneNode(true);
      backgroundSvg.getElementById('emblem').remove();
      const emblem = foregroundSvg.getElementById('emblem');
      emblem.setAttribute('transform', 'translate(512 512) scale(0.74) translate(-512 -512) ' + (emblem.getAttribute('transform') || ''));
      const serializer = new XMLSerializer();
      async function load(svg) {
        const url = URL.createObjectURL(new Blob([serializer.serializeToString(svg)], { type: 'image/svg+xml' }));
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image;
        } finally { URL.revokeObjectURL(url); }
      }
      const icon = await load(documentSvg);
      const foreground = await load(foregroundSvg);
      const background = await load(backgroundSvg);
      const layers = { icon, foreground, background, round: icon };
      function raster(layer, size) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d', { alpha: layer === 'foreground' || layer === 'round' });
        if (layer === 'round') {
          context.beginPath();
          context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          context.clip();
        }
        context.drawImage(layers[layer], 0, 0, size, size);
        return canvas;
      }
      const pixels = raster('foreground', 1024).getContext('2d').getImageData(0, 0, 1024, 1024).data;
      let maxRadius = 0;
      for (let pixel = 0; pixel < 1024 * 1024; pixel++) {
        if (pixels[pixel * 4 + 3] < 16) continue;
        maxRadius = Math.max(maxRadius, Math.hypot(pixel % 1024 + 0.5 - 512, Math.floor(pixel / 1024) + 0.5 - 512));
      }
      const safeRadius = 1024 * 33 / 108;
      if (maxRadius > safeRadius) throw new Error('Android foreground exceeds the adaptive-icon safe zone');
      return {
        maxRadius, safeRadius,
        artifacts: ${JSON.stringify(outputs)}.map((output) => ({
          ...output, data: raster(output.layer, output.size).toDataURL('image/png').split(',')[1],
        })),
      };
    })()`,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const { artifacts, maxRadius, safeRadius } = result.result.value;
  for (const artifact of artifacts) {
    const raster = Buffer.from(artifact.data, 'base64');
    const opaque = artifact.layer === 'icon' || artifact.layer === 'background';
    const png = opaque
      ? PNG.sync.write(PNG.sync.read(raster), { colorType: 2, inputColorType: 6, bitDepth: 8 })
      : raster;
    if (png.readUInt32BE(16) !== artifact.size || png.readUInt32BE(20) !== artifact.size) {
      throw new Error(`Incorrect icon dimensions: ${artifact.file}`);
    }
    if (opaque && png[25] !== 2) throw new Error(`Icon must be RGB without alpha: ${artifact.file}`);
    const destination = path.join(root, artifact.file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, png);
  }
  console.log(`Exported ${artifacts.length} icons. Store masters: assets/icon-only.png (1024), assets/play-store-icon.png (512).`);
  console.log(`Android safe zone: artwork radius ${maxRadius.toFixed(1)} / ${safeRadius.toFixed(1)} pixels.`);
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  if (chrome.exitCode === null) {
    const closed = new Promise((resolve) => chrome.once('close', resolve));
    chrome.kill();
    await closed;
  }
  await rm(profile, { recursive: true, force: true });
}