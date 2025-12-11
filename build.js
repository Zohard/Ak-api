const { execSync } = require('child_process');

// Base build
execSync('npx prisma generate && nest build', { stdio: 'inherit' });

// Only run Vercel-specific build if deploying to Vercel
if (process.env.VERCEL) {
  execSync('node build-api.js', { stdio: 'inherit' });
}