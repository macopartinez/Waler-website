import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const ICON_SIZES = [16, 32, 48, 128];

// URL du backend injectée dans TOUS les bundles à la compilation (remplace
// `__WALER_API_BASE__` dans src/config.ts). Défaut = localhost (dev) ; le packaging
// store (package-extension.js) exporte WALER_API_BASE=https://waler.website avant
// d'appeler `npm run build`, garantissant que le ZIP ne contient jamais localhost.
const WALER_API_BASE = process.env.WALER_API_BASE || 'http://localhost:5000';
const DEFINE = { __WALER_API_BASE__: JSON.stringify(WALER_API_BASE) };

async function build() {
  console.log('🔨 Building Waler Extension...');
  console.log(`🔧 API base injectée : ${WALER_API_BASE}\n`);

  // Build service worker
  console.log('📦 Building service worker...');
  await esbuild.build({
    entryPoints: ['src/background/service-worker.ts'],
    bundle: true,
    outfile: 'dist/background/service-worker.js',
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    define: DEFINE,
  });
  console.log('✓ Service worker built\n');

  // Build content scripts
  console.log('📦 Building Instagram tracker...');
  await esbuild.build({
    entryPoints: ['src/content/instagram-tracker.ts'],
    bundle: true,
    outfile: 'dist/content/instagram-tracker.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    define: DEFINE,
  });
  console.log('✓ Instagram tracker built\n');

  console.log('📦 Building auth listener...');
  await esbuild.build({
    entryPoints: ['src/content/auth-listener.ts'],
    bundle: true,
    outfile: 'dist/content/auth-listener.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    define: DEFINE,
  });
  console.log('✓ Auth listener built\n');

  // Build page interceptor (s'exécute dans le MONDE PRINCIPAL de la page)
  console.log('📦 Building page interceptor (MAIN world)...');
  await esbuild.build({
    entryPoints: ['src/injected/page-interceptor.ts'],
    bundle: true,
    outfile: 'dist/injected/page-interceptor.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    define: DEFINE,
  });
  console.log('✓ Page interceptor built\n');

  // Build popup script
  console.log('📦 Building popup script...');
  await esbuild.build({
    entryPoints: ['src/popup/popup-chrome.ts'],
    bundle: true,
    outfile: 'dist/popup/popup-chrome.js',
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    define: DEFINE,
  });
  console.log('✓ Popup script built\n');

  // Copy popup HTML
  console.log('📄 Copying popup HTML...');
  mkdirSync('dist/popup', { recursive: true });
  copyFileSync('src/popup/index.html', 'dist/popup/index.html');
  console.log('✓ Popup HTML copied\n');

  // Create manifest
  console.log('📝 Creating manifest...');
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
  manifest.background.service_worker = 'background/service-worker.js';
  manifest.action.default_popup = 'popup/index.html';

  // Reconstruire content_scripts (chemins relatifs au dossier dist/)
  manifest.content_scripts = [
    {
      matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
      js: ['injected/page-interceptor.js'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
      js: ['content/instagram-tracker.js'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://waler.website/*', 'http://localhost:5000/*'],
      js: ['content/auth-listener.js'],
      run_at: 'document_idle',
    },
  ];

  // Mettre à jour les ressources accessibles
  manifest.web_accessible_resources = [
    {
      resources: ['injected/page-interceptor.js'],
      matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
    },
  ];

  // Permettre au site de communiquer avec l'extension
  manifest.externally_connectable = {
    matches: ['https://waler.website/*', 'http://localhost:5000/*'],
  };

  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('✓ Manifest created\n');

  // Copy extension icons
  console.log('🎨 Copying icons...');
  mkdirSync('dist/assets/icons', { recursive: true });
  for (const size of ICON_SIZES) {
    copyFileSync(`assets/icons/icon-${size}.png`, `dist/assets/icons/icon-${size}.png`);
  }
  console.log('✓ Icons copied\n');

  console.log('✅ Build complete! Extension ready in dist/');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
