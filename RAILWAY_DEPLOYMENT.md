# Railway Deployment Guide

## Prerequisites
1. Railway account connected to your GitHub repository
2. PostgreSQL database provisioned on Railway (or external)
3. Redis instance provisioned on Railway (if using cache)

## Configuration Steps

### 1. Railway Project Setup
1. Create a new project in Railway
2. Connect your GitHub repository: `anime-kun-nestjs-v2`
3. Railway will automatically detect the Dockerfile and `railway.toml`

### 2. Environment Variables
In Railway, add these environment variables:

#### Required Variables:
```
NODE_ENV=production
PORT=3003

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://your-frontend-domain.com

# API Keys (if using external services)
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=your_imagekit_endpoint
```

#### Optional Variables:
```
# Redis (if using cache)
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Email (if using nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# DeepL Translation (if using)
DEEPL_API_KEY=your-deepl-key
```

### 3. Database Setup
After deployment, run migrations:
1. In Railway dashboard, go to your service
2. Click on "Settings" > "Deploy"
3. Add this to "Custom Build Command" (optional):
   ```
   npm run build && npx prisma migrate deploy
   ```

Or run migrations manually via Railway CLI:
```bash
railway run npx prisma migrate deploy
```

### 4. Health Check
Once deployed, verify the API is running:
```
https://your-app.railway.app/api/health
```

### 5. Troubleshooting

#### Build Fails
- Check Railway build logs for specific errors
- Ensure all dependencies are in `package.json`
- Verify `Dockerfile` builds locally: `docker build -t test .`

#### App Crashes on Start
- Check environment variables are set correctly
- Verify DATABASE_URL is accessible from Railway
- Check logs: Railway Dashboard > Your Service > Logs

#### Prisma Issues
- Run `npx prisma generate` in build step (already in package.json postinstall)
- Ensure DATABASE_URL format is correct
- Check database connection from Railway

## Build Configuration

The `railway.toml` file configures:
- **Builder**: Uses Dockerfile for consistent builds
- **Start Command**: `node dist/main.js`
- **Restart Policy**: Auto-restart on failure

## Custom Domain (Optional)
1. Go to Railway Dashboard > Your Service > Settings
2. Click on "Domains"
3. Add custom domain or use Railway-provided domain

## Monitoring
- View logs in Railway Dashboard
- Set up health check monitoring
- Configure alerts for downtime

## Scaling
Railway automatically scales based on:
- Memory usage
- CPU usage
- Request volume

For manual scaling:
1. Go to Service > Settings
2. Adjust "Resources" settings

## Cost Optimization
- Use Railway's free tier for development
- Monitor usage in Dashboard > Usage
- Set spending limits in Project Settings
