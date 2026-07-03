// One-off generator for PWA icons + iOS splash screens. Run with: node scripts/generate-pwa-assets.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ICONS_DIR = path.join(ROOT, "public", "icons");
const SPLASH_DIR = path.join(ROOT, "public", "splash");

const TEAL = "#0d9488";
const TEAL_DARK = "#0f766e";

// Bounce glyph: a single V-shaped drop-then-climb line (coords in a 0-100 box), plus a dot marking "now".
function glyphPath() {
  return {
    points: "14,22 50,86 86,18",
    dot: { cx: 86, cy: 18 },
  };
}

function iconSvg(size, { rounded = true, corner = 0.22 } = {}) {
  const r = rounded ? size * corner : 0;
  const glyphBox = size * 0.6; // glyph drawn in a 100x100 space scaled into this box
  const scale = glyphBox / 100;
  const offset = (size - glyphBox) / 2;
  const strokeWidth = 9 / scale > 0 ? 9 : 9; // stroke width in glyph-space units (~9% of glyphBox after scaling)
  const { points, dot } = glyphPath();
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${TEAL}" />
          <stop offset="1" stop-color="${TEAL_DARK}" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)" />
      <g transform="translate(${offset}, ${offset}) scale(${scale})">
        <polyline points="${points}" fill="none" stroke="#ffffff"
          stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${dot.cx}" cy="${dot.cy}" r="7" fill="#ffffff" />
      </g>
    </svg>`;
}

async function renderIcon(size, filename, opts = {}) {
  const svg = iconSvg(size, opts);
  await sharp(Buffer.from(svg)).png().toFile(path.join(ICONS_DIR, filename));
  console.log("icon:", filename);
}

// Apple splash screens: portrait-only (app is orientation-locked to portrait).
// [width, height, device-pixel-ratio, label]
const SPLASH_SCREENS = [
  [1290, 2796, 3, "iPhone 15 Pro Max / 14 Pro Max"],
  [1179, 2556, 3, "iPhone 15 Pro / 14 Pro / 15 / 14"],
  [1170, 2532, 3, "iPhone 13 / 12"],
  [1284, 2778, 3, "iPhone 13 Pro Max / 12 Pro Max"],
  [1125, 2436, 3, "iPhone X / XS / 11 Pro"],
  [1242, 2688, 3, "iPhone XS Max / 11 Pro Max"],
  [828, 1792, 2, "iPhone 11 / XR"],
  [750, 1334, 2, "iPhone SE / 8 / 7 / 6s"],
  [2048, 2732, 2, "iPad Pro 12.9\""],
  [1668, 2388, 2, "iPad Pro 11\""],
  [1640, 2360, 2, "iPad Air"],
  [1620, 2160, 2, "iPad 10.2\""],
];

async function renderSplash(width, height, dpr) {
  const glyphSize = Math.min(width, height) * 0.22;
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#f8fafc" />
      <g transform="translate(${(width - glyphSize) / 2}, ${(height - glyphSize) / 2})">
        ${iconSvg(glyphSize, { rounded: true, corner: 0.22 })}
      </g>
    </svg>`;
  const filename = `apple-splash-${width}x${height}.png`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(SPLASH_DIR, filename));
  console.log("splash:", filename);
  return { width, height, dpr, filename };
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  await mkdir(SPLASH_DIR, { recursive: true });

  await renderIcon(192, "icon-192.png");
  await renderIcon(512, "icon-512.png");
  await renderIcon(180, "icon-180.png");
  await renderIcon(152, "icon-152.png");
  await renderIcon(167, "icon-167.png");
  // Maskable: no rounded corners baked in (OS applies its own mask), smaller glyph so it survives any crop.
  await renderIcon(512, "maskable-512.png", { rounded: false, corner: 0 });

  const manifest = [];
  for (const [width, height, dpr] of SPLASH_SCREENS) {
    manifest.push(await renderSplash(width, height, dpr));
  }

  // Emit the <link> tags for layout.tsx so device-size splash mapping stays in sync with the generated files.
  const links = manifest
    .map(
      ({ width, height, dpr, filename }) =>
        `<link rel="apple-touch-startup-image" media="(device-width: ${width / dpr}px) and (device-height: ${height / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="/splash/${filename}" />`
    )
    .join("\n");
  console.log("\n--- apple-touch-startup-image links ---\n" + links);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
