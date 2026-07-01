import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Le nom du ZIP suit AUTOMATIQUEMENT la version du manifest correspondant, pour
// qu'il n'y ait jamais d'écart entre "version dans le manifest" et "nom du fichier"
// (sinon on ne sait plus quel ZIP est le récent — bug vécu).
function versionOf(manifestFile) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, manifestFile), 'utf8')).version;
}

const PLATFORMS = {
  chrome: {
    name: 'Chrome/Edge',
    manifest: 'manifest.production.json',
    output: `waler-chrome-v${versionOf('manifest.production.json')}.zip`
  },
  firefox: {
    name: 'Firefox',
    manifest: 'manifest.firefox.json',
    output: `waler-firefox-v${versionOf('manifest.firefox.json')}.zip`
  }
};

const FILES_TO_INCLUDE = [
  'dist/',
  'assets/',
  'src/popup/',
  'injected/'
];

const FILES_TO_EXCLUDE = [
  'node_modules',
  'src/background',
  'src/content',
  'src/injected',
  'src/config.ts',
  '.git',
  'test',
  '*.ts',
  '*.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'BUILD.bat',
  'build.js'
];

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m'
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${message}${reset}`);
}

function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest, excludePatterns = []) {
  if (!fs.existsSync(src)) {
    return;
  }

  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    files.forEach(file => {
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace('*', '.*'));
          return regex.test(file);
        }
        return file === pattern || file.includes(pattern);
      });

      if (!shouldExclude) {
        copyRecursive(
          path.join(src, file),
          path.join(dest, file),
          excludePatterns
        );
      }
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function createZip(sourceDir, outputFile) {
  try {
    // Utiliser PowerShell pour créer le ZIP sur Windows
    const command = `powershell Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${outputFile}" -Force`;
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    log(`Erreur lors de la création du ZIP: ${error.message}`, 'error');
    return false;
  }
}

function buildExtension() {
  log('🔨 Building extension...', 'info');
  try {
    // Force l'URL de PROD dans les bundles compilés (sign-in, API, dashboard…).
    // Sans ça, config.ts garde son défaut localhost → cause exacte du refus v1.0.1.
    execSync('npm run build', {
      stdio: 'inherit',
      env: { ...process.env, WALER_API_BASE: 'https://waler.website' },
    });
    log('✅ Build completed', 'success');
    return true;
  } catch (error) {
    log('❌ Build failed', 'error');
    return false;
  }
}

function packageForPlatform(platform, config) {
  log(`\n📦 Packaging for ${config.name}...`, 'info');
  
  const tempDir = path.join(__dirname, '.temp-package');
  cleanDirectory(tempDir);

  // Copier le manifest approprié
  const manifestSrc = path.join(__dirname, config.manifest);
  const manifestDest = path.join(tempDir, 'manifest.json');
  
  if (!fs.existsSync(manifestSrc)) {
    log(`❌ Manifest not found: ${config.manifest}`, 'error');
    return false;
  }
  
  fs.copyFileSync(manifestSrc, manifestDest);
  log(`  ✓ Copied ${config.manifest} as manifest.json`, 'success');

  // Copier les fichiers nécessaires
  FILES_TO_INCLUDE.forEach(item => {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(tempDir, item);
    
    if (fs.existsSync(srcPath)) {
      copyRecursive(srcPath, destPath, FILES_TO_EXCLUDE);
      log(`  ✓ Copied ${item}`, 'success');
    } else {
      log(`  ⚠ Skipped ${item} (not found)`, 'warning');
    }
  });

  // Supprimer le manifest généré par build.js dans dist/ (doublon)
  const distManifest = path.join(tempDir, 'dist', 'manifest.json');
  if (fs.existsSync(distManifest)) {
    fs.unlinkSync(distManifest);
  }

  // Créer le ZIP
  const outputPath = path.join(__dirname, 'releases', config.output);
  const releasesDir = path.join(__dirname, 'releases');
  
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir);
  }

  log(`  📦 Creating ZIP: ${config.output}...`, 'info');
  const success = createZip(tempDir, outputPath);

  // Nettoyer
  cleanDirectory(tempDir);
  fs.rmdirSync(tempDir);

  if (success) {
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    log(`  ✅ Package created: ${config.output} (${sizeMB} MB)`, 'success');
    return true;
  }
  
  return false;
}

function validateManifests() {
  log('🔍 Validating manifests...', 'info');
  
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    const manifestPath = path.join(__dirname, config.manifest);
    
    if (!fs.existsSync(manifestPath)) {
      log(`  ❌ Missing manifest: ${config.manifest}`, 'error');
      return false;
    }
    
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      JSON.parse(content);
      log(`  ✓ ${config.manifest} is valid`, 'success');
    } catch (error) {
      log(`  ❌ Invalid JSON in ${config.manifest}`, 'error');
      return false;
    }
  }
  
  return true;
}

function main() {
  log('🚀 Waler Extension Packaging Tool\n', 'info');
  
  // Validation
  if (!validateManifests()) {
    log('\n❌ Validation failed. Aborting.', 'error');
    process.exit(1);
  }

  // Build
  if (!buildExtension()) {
    log('\n❌ Build failed. Aborting.', 'error');
    process.exit(1);
  }

  // Package pour chaque plateforme
  let successCount = 0;
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    if (packageForPlatform(platform, config)) {
      successCount++;
    }
  }

  // Résumé
  log('\n' + '='.repeat(50), 'info');
  if (successCount === Object.keys(PLATFORMS).length) {
    log('✅ All packages created successfully!', 'success');
    log('\n📁 Packages location: ./releases/', 'info');
    log('\nNext steps:', 'info');
    log('  1. Test each package in their respective browsers', 'warning');
    log('  2. Upload to store dashboards:', 'warning');
    log('     - Chrome: https://chrome.google.com/webstore/devconsole', 'info');
    log('     - Firefox: https://addons.mozilla.org/developers/', 'info');
    log('     - Edge: https://partner.microsoft.com/dashboard', 'info');
  } else {
    log(`⚠ Only ${successCount}/${Object.keys(PLATFORMS).length} packages created`, 'warning');
  }
  log('='.repeat(50), 'info');
}

main();
