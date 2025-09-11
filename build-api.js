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
  
  // Proper TypeScript to JavaScript conversion for the API entry
  let jsContent = apiContent;
  
  // Convert imports to require statements
  jsContent = jsContent.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"];/g, 'const { $1 } = require("$2");');
  jsContent = jsContent.replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"];/g, 'const $1 = require("$2");');
  
  // Convert export default
  jsContent = jsContent.replace(/export\s+default\s+/, 'module.exports = ');
  
  // Remove type annotations more carefully
  jsContent = jsContent.replace(/:\s*(VercelRequest|VercelResponse)/g, '');
  jsContent = jsContent.replace(/:\s*any\b/g, '');
  jsContent = jsContent.replace(/\bas\s+any\b/g, '');
  
  // Fix import paths for the built files
  jsContent = jsContent.replace(/require\("\.\.\/src\//g, 'require("../');
  
  // Fix spacing issues
  jsContent = jsContent.replace(/\(\s+/g, '(');
  jsContent = jsContent.replace(/\s+\)/g, ')');
  jsContent = jsContent.replace(/\{\s+([^}]+)\s+\}/g, '{ $1 }');
  
  // Fix the function signature to include both req and res parameters
  jsContent = jsContent.replace(
    /module\.exports = async \(req\) =>/,
    'module.exports = async (req, res) =>'
  );
  
  fs.writeFileSync(apiDest, jsContent);
  console.log('✅ API entry point built successfully');
} else {
  console.log('⚠️  API source file not found, skipping build');
}