const fs = require('fs');
const path = require('path');

// Ensure the dist/api directory exists
const apiDistDir = path.join(__dirname, 'dist', 'api');
if (!fs.existsSync(apiDistDir)) {
  fs.mkdirSync(apiDistDir, { recursive: true });
}

// Copy the API entry point to the dist directory
const apiSource = path.join(__dirname, 'api', 'index.ts');
const apiDest = path.join(__dirname, 'dist', 'api', 'index.js');

if (fs.existsSync(apiSource)) {
  // For Vercel, we need to transpile the TypeScript file
  // Since we're in a build context, the TypeScript should already be compiled
  // We'll copy the api directory to dist for Vercel deployment
  const apiContent = fs.readFileSync(apiSource, 'utf8');
  
  // Simple TypeScript to JavaScript conversion for the API entry
  const jsContent = apiContent
    .replace(/import\s+([^;]+)\s+from\s+['"]([^'"]+)['"];/g, 'const $1 = require("$2");')
    .replace(/export\s+default\s+/, 'module.exports = ')
    .replace(/:\s*[A-Za-z<>\[\]|,\s]+/g, '') // Remove type annotations
    .replace(/as\s+any/g, '');
  
  fs.writeFileSync(apiDest, jsContent);
  console.log('✅ API entry point built successfully');
} else {
  console.log('⚠️  API source file not found, skipping build');
}