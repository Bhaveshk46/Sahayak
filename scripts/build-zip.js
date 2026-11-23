import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('🚀 Building FormPilot Chrome Extension Package for Judges');
console.log('====================================================');

const rootDir = process.cwd();
const outputDir = path.join(rootDir, '.output');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Run WXT zip
console.log('1. Compiling and bundling extension with wxt zip...');
execSync('npx wxt zip', { stdio: 'inherit', cwd: rootDir });

// 2. Locate generated zip in .output/
const files = fs.readdirSync(outputDir);
const zipFile = files.find((f) => f.endsWith('.zip'));

if (!zipFile) {
  console.error('❌ Error: Could not find generated zip in .output/');
  process.exit(1);
}

const srcZipPath = path.join(outputDir, zipFile);
const targetZipPath = path.join(distDir, 'sahayak-extension-v1.0.0.zip');
const legacyZipPath = path.join(distDir, 'formpilot-extension-v1.0.0.zip');

fs.copyFileSync(srcZipPath, targetZipPath);
fs.copyFileSync(srcZipPath, legacyZipPath);

const stats = fs.statSync(targetZipPath);
const sizeKB = (stats.size / 1024).toFixed(2);

console.log('====================================================');
console.log('✅ Sahayak Extension Package Ready for Submission!');
console.log(`📦 File: dist/sahayak-extension-v1.0.0.zip`);
console.log(`📊 Size: ${sizeKB} KB (${stats.size} bytes)`);
console.log(`📂 Unpacked Directory: .output/chrome-mv3/`);
console.log('====================================================');
