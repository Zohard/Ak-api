// IMPORTANT: This file must be imported at the very top of main.ts
// before any other imports to ensure Sentry captures all errors
import * as Sentry from '@sentry/nestjs';

// Only initialize if DSN is configured
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',

    // Performance Monitoring - 1% in production to minimize egress
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 1.0,

    // Send default PII (IP address, user context)
    sendDefaultPii: true,

    // Add Railway context to all events
    beforeSend(event) {
      if (event.request) {
        event.contexts = event.contexts || {};
        event.contexts.railway = {
          service: process.env.RAILWAY_SERVICE_NAME,
          environment: process.env.RAILWAY_ENVIRONMENT_NAME,
          deployment_id: process.env.RAILWAY_DEPLOYMENT_ID,
        };
      }
      return event;
    },
  });
}
