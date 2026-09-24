#!/usr/bin/env node
// Generates every app icon from one SVG design:
//   npm run icons
// Output (src/public/, copied to dist/ on build):
//   favicon.svg, favicon.ico (16/32/48), icons/apple-touch-icon.png (180),
//   icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png
//
// Design: a white calendar with a tick on an indigo-violet gradient, plus an
// amber star for "everyone's free". The same artwork is inlined as the logo
// in src/partials/logo.html; keep them in sync.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve(import.meta.dirname, '../src/public');

/** The artwork on a 512×512 canvas. `maskable` = full-bleed, content in the safe zone. */
export function iconSvg({ maskable = false } = {}) {
    // Maskable icons get cropped to a circle/squircle by Android: fill the whole
    // square and keep the artwork inside the central ~70%.
    const art = maskable ? 'translate(76.8 76.8) scale(0.7)' : '';
    const bg = maskable
        ? '<rect width="512" height="512" fill="url(#bg)"/>'
        : '<rect width="512" height="512" rx="116" fill="url(#bg)"/>';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#818cf8"/>
      <stop offset="0.55" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
    <radialGradient id="glow" cx="150" cy="96" r="300" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${bg}
  ${maskable ? '<rect width="512" height="512" fill="url(#glow)"/>' : '<rect width="512" height="512" rx="116" fill="url(#glow)"/>'}
  <g transform="${art}">
  <g transform="translate(-30 8)"><!-- optically centre calendar + star -->
    <!-- calendar body with a tinted header band -->
    <rect x="104" y="136" width="304" height="276" rx="56" fill="#fff"/>
    <path d="M104 192a56 56 0 0 1 56-56h192a56 56 0 0 1 56 56v22H104z" fill="#e0e7ff"/>
    <!-- binder rings -->
    <rect x="168" y="96" width="36" height="88" rx="18" fill="#fff"/>
    <rect x="308" y="96" width="36" height="88" rx="18" fill="#fff"/>
    <rect x="176" y="104" width="20" height="72" rx="10" fill="#c7d2fe"/>
    <rect x="316" y="104" width="20" height="72" rx="10" fill="#c7d2fe"/>
    <!-- tick -->
    <path d="M178 312l50 50 108-112" fill="none" stroke="#6366f1" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- "everyone free" star -->
    <path d="M404 92l21.7 44 48.5 7-35.1 34.2 8.3 48.3L404 202.7l-43.4 22.8 8.3-48.3-35.1-34.2 48.5-7z"
          fill="#fbbf24" stroke="#fff" stroke-width="14" stroke-linejoin="round"/>
  </g>
  </g>
</svg>
`;
}

/**
 * Notification badge (Android status bar): a white silhouette on transparent;
 * only the alpha channel is used. The calendar with the tick cut out.
 */
export function badgeSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>
    <mask id="cut">
      <rect width="96" height="96" fill="#fff"/>
      <path d="M31 57l10 10 24-25" fill="none" stroke="#000" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="12" y="30" width="72" height="5" fill="#000"/>
    </mask>
  </defs>
  <g fill="#fff" mask="url(#cut)">
    <rect x="12" y="20" width="72" height="66" rx="14"/>
    <rect x="28" y="10" width="9" height="20" rx="4.5"/>
    <rect x="59" y="10" width="9" height="20" rx="4.5"/>
  </g>
</svg>
`;
}

/** Minimal .ico container holding PNG images (supported by all current browsers). */
function toIco(pngs) {
    const header = Buffer.alloc(6 + 16 * pngs.length);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(pngs.length, 4);
    let offset = header.length;
    pngs.forEach(({ size, data }, i) => {
        const e = 6 + i * 16;
        header.writeUInt8(size >= 256 ? 0 : size, e);
        header.writeUInt8(size >= 256 ? 0 : size, e + 1);
        header.writeUInt8(0, e + 2); // palette
        header.writeUInt8(0, e + 3); // reserved
        header.writeUInt16LE(1, e + 4); // colour planes
        header.writeUInt16LE(32, e + 6); // bits per pixel
        header.writeUInt32LE(data.length, e + 8);
        header.writeUInt32LE(offset, e + 12);
        offset += data.length;
    });
    return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

const standard = iconSvg();
const maskable = iconSvg({ maskable: true });

fs.writeFileSync(path.join(out, 'favicon.svg'), standard);
fs.writeFileSync(path.join(out, 'icons/apple-touch-icon.png'), await png(maskable, 180)); // iOS rounds corners itself
fs.writeFileSync(path.join(out, 'icons/icon-192.png'), await png(standard, 192));
fs.writeFileSync(path.join(out, 'icons/icon-512.png'), await png(standard, 512));
fs.writeFileSync(path.join(out, 'icons/maskable-512.png'), await png(maskable, 512));
fs.writeFileSync(path.join(out, 'icons/badge-96.png'), await png(badgeSvg(), 96));
fs.writeFileSync(path.join(out, 'favicon.ico'), toIco(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(standard, size) })))));

console.log('Icons written to src/public/ (favicon.svg, favicon.ico, icons/*.png)');
