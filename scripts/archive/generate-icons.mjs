import sharp from 'sharp';

const svgIcon = (size) => {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#7fffb0"/>
      <stop offset="30%"  stop-color="#02c950"/>
      <stop offset="70%"  stop-color="#00a03e"/>
      <stop offset="100%" stop-color="#005520"/>
    </linearGradient>
    <linearGradient id="shine" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="50%"  stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="${s * 0.04}" flood-color="#02c950" flood-opacity="0.8"/>
    </filter>
  </defs>
  <rect width="${s}" height="${s}" fill="#000000" rx="${s * 0.18}"/>
  <text
    x="${cx}"
    y="${cy + s * 0.27}"
    text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif"
    font-weight="900"
    font-size="${s * 0.65}"
    fill="url(#glow)"
    filter="url(#shadow)"
    stroke="#004d20"
    stroke-width="${s * 0.012}"
  >W</text>
  <text
    x="${cx}"
    y="${cy + s * 0.27}"
    text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif"
    font-weight="900"
    font-size="${s * 0.65}"
    fill="url(#shine)"
  >W</text>
</svg>`;
};

const sizes = [16, 32, 48, 128];
const outDir = 'waler-extension/assets/icons';

for (const size of sizes) {
  const dest = `${outDir}/icon-${size}.png`;
  await sharp(Buffer.from(svgIcon(size)))
    .png()
    .toFile(dest);
  console.log(`✓ ${dest}`);
}

console.log('Done.');
