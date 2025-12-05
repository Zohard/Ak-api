# Deployment Guide - Anime-Kun NestJS v3.0

Ce guide décrit le processus de déploiement de l'API Anime-Kun en production.

## Table des matières

1. [Architecture de déploiement](#architecture)
2. [Prérequis](#prerequisites)
3. [Configuration environnement](#environment)
4. [Déploiement avec Docker](#docker-deployment)
5. [Pipeline CI/CD](#cicd-pipeline)
6. [Migration de base de données](#database-migration)
7. [Monitoring et logs](#monitoring)
8. [Sécurité](#security)
9. [Maintenance](#maintenance)

## Architecture de déploiement {#architecture}

### Infrastructure recommandée

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │     Web Server  │    │    Database     │
│    (Nginx)      │────│   (Node.js)     │────│  (PostgreSQL)   │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         │              │     Redis       │              │
         └──────────────│   (Cache)       │──────────────┘
                        │                 │
                        └─────────────────┘
```

### Composants

- **Load Balancer**: Nginx avec SSL termination
- **Application**: NestJS API (Docker containers)
- **Database**: PostgreSQL 15+
- **Cache**: Redis (optionnel)
- **Storage**: Système de fichiers ou S3-compatible
- **Monitoring**: Prometheus + Grafana

## Prérequis {#prerequisites}

### Serveur

- **OS**: Ubuntu 20.04+ / CentOS 8+ / Amazon Linux 2
- **CPU**: 2+ cores
- **RAM**: 4GB+ (8GB recommandé)
- **Storage**: 50GB+ SSD
- **Network**: Accès internet et ports 80, 443

### Logiciels

- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Node.js**: 18+ (pour développement)
- **PostgreSQL**: 15+
- **Nginx**: 1.20+

### Domaines et certificats

- Domaine configuré (ex: `api.anime-kun.com`)
- Certificat SSL (Let's Encrypt recommandé)

## Configuration environnement {#environment}

### Variables d'environnement

Créer le fichier `.env.production`:

```bash
# Base de données
DATABASE_URL=postgresql://user:password@localhost:5432/anime_kun_prod

# Application
NODE_ENV=production
PORT=3003
FRONTEND_URL=https://anime-kun.com

# JWT
JWT_SECRET=your-ultra-secure-jwt-secret-256-bits-minimum
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# SMTP
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=postmaster@mg.anime-kun.com
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@anime-kun.com

# Redis (optionnel)
REDIS_URL=redis://localhost:6379

# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
LOG_LEVEL=warn

# Sécurité
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
CORS_ORIGIN=https://anime-kun.com,https://www.anime-kun.com

# Features
ENABLE_SWAGGER=false
ENABLE_RATE_LIMITING=true
ENABLE_AUDIT_LOGS=true
```

### Secrets management

Utiliser un gestionnaire de secrets sécurisé:

```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name "anime-kun/production/env" \
  --description "Environment variables for Anime-Kun API" \
  --secret-string file://.env.production

# Ou HashiCorp Vault
vault kv put secret/anime-kun/production @.env.production
```

## Déploiement avec Docker {#docker-deployment}

### 1. Préparation

```bash
# Cloner le repository
git clone https://github.com/your-org/anime-kun-nestjs-v2.git
cd anime-kun-nestjs-v2

# Configurer l'environnement
cp .env.example .env.production
# Éditer .env.production avec vos valeurs
```

### 2. Build et déploiement

```bash
# Build de l'image
docker build -t anime-kun-api:latest .

# Ou utiliser docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Configuration Nginx

Créer `/etc/nginx/sites-available/anime-kun-api`:

```nginx
upstream anime_kun_api {
    server 127.0.0.1:3003;
    # Ajouter d'autres instances pour load balancing
    # server 127.0.0.1:3004;
}

server {
    listen 80;
    server_name api.anime-kun.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.anime-kun.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.anime-kun.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.anime-kun.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types application/json application/javascript text/css text/javascript;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://anime_kun_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files (uploads)
    location /uploads/ {
        alias /var/www/anime-kun-uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
    }
}
```

### 4. Activation de la configuration

```bash
sudo ln -s /etc/nginx/sites-available/anime-kun-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Pipeline CI/CD {#cicd-pipeline}

Le pipeline GitHub Actions est configuré pour:

### Branches et environnements

- **develop** → Déploiement automatique en staging
- **main** → Déploiement automatique en production (avec approbation manuelle)

### Étapes du pipeline

1. **Test** (toutes les branches)
   - Tests unitaires
   - Tests d'intégration
   - Tests e2e
   - Analyse de sécurité

2. **Build** (toutes les branches)
   - Construction de l'application
   - Génération des artefacts

3. **Docker** (main/develop seulement)
   - Construction de l'image Docker
   - Push vers le registry

4. **Deploy** (avec approbation)
   - Déploiement automatisé
   - Tests de santé post-déploiement

### Configuration des secrets

Dans GitHub Actions, configurer:

```
DATABASE_URL
JWT_SECRET
SMTP_HOST
SMTP_USER
SMTP_PASS
SENTRY_DSN
CODECOV_TOKEN
SNYK_TOKEN
```

## Migration de base de données {#database-migration}

### 1. Préparation

```bash
# Installer les dépendances de migration
npm install mysql2

# Configurer les variables d'environnement MySQL
export MYSQL_HOST=old-server.com
export MYSQL_USER=migration_user
export MYSQL_PASSWORD=migration_password
export MYSQL_DATABASE=anime_kun_old
```

### 2. Exécution de la migration

```bash
# Migration complète
node scripts/migrate-database.js

# Migration par étapes
node scripts/migrate-database.js --step=users
node scripts/migrate-database.js --step=animes
node scripts/migrate-database.js --step=mangas
node scripts/migrate-database.js --step=reviews
```

### 3. Vérification post-migration

```bash
# Vérifier les données migrées
npm run verify-migration

# Tests de santé
curl https://api.anime-kun.com/api/health
```

## Monitoring et logs {#monitoring}

### 1. Configuration des logs

```typescript
// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});
```

### 2. Monitoring avec Prometheus

Créer `/etc/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'anime-kun-api'
    static_configs:
      - targets: ['localhost:3003']
    metrics_path: '/metrics'
```

### 3. Alerting

Configuration des alertes critiques:

```yaml
# alerts.yml
groups:
  - name: anime-kun-api
    rules:
      - alert: APIDown
        expr: up{job="anime-kun-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API Anime-Kun is down"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
```

## Sécurité {#security}

### 1. Configuration du firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3003/tcp  # API port (internal only)
sudo ufw enable
```

### 2. Hardening du serveur

```bash
# Mises à jour automatiques
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades

# Fail2ban pour protection SSH
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### 3. Sécurité de l'application

- **Rate limiting**: Configuré dans Nginx et l'application
- **CORS**: Restriction des domaines autorisés
- **Headers de sécurité**: HSTS, CSP, X-Frame-Options
- **Validation**: Validation stricte des inputs
- **JWT**: Tokens avec expiration courte + refresh tokens

### 4. Sauvegarde et récupération

```bash
# Sauvegarde automatique de la base de données
#!/bin/bash
# /etc/cron.daily/backup-anime-kun-db

BACKUP_DIR="/backups/anime-kun"
DATE=$(date +%Y%m%d_%H%M%S)

pg_dump anime_kun_prod | gzip > "$BACKUP_DIR/anime_kun_$DATE.sql.gz"

# Nettoyer les sauvegardes anciennes (>30 jours)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
```

## Maintenance {#maintenance}

### 1. Mises à jour

```bash
# Mise à jour avec zero downtime
docker pull anime-kun-api:latest
docker-compose -f docker-compose.prod.yml up -d --no-deps api

# Vérification de la santé
curl https://api.anime-kun.com/api/health
```

### 2. Scaling horizontal

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  api:
    image: anime-kun-api:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

### 3. Maintenance programmée

```bash
# Script de maintenance
#!/bin/bash
echo "Starting maintenance..."

# Mettre l'API en mode maintenance
curl -X POST https://api.anime-kun.com/api/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": true}'

# Effectuer les tâches de maintenance
# ...

# Réactiver l'API
curl -X POST https://api.anime-kun.com/api/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'

echo "Maintenance completed!"
```

### 4. Troubleshooting

#### Problèmes courants

**API lente**:
```bash
# Vérifier les logs
docker logs anime-kun-api

# Vérifier les métriques de base de données
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

**Erreurs 5xx**:
```bash
# Vérifier les logs d'erreur
tail -f logs/error.log

# Vérifier la santé des services
docker-compose ps
```

**Problèmes de mémoire**:
```bash
# Monitoring des ressources
docker stats anime-kun-api

# Analyser les fuites mémoire
node --inspect=0.0.0.0:9229 dist/main.js
```

## Checklist de déploiement

### Pré-déploiement
- [ ] Tests passent en local
- [ ] Variables d'environnement configurées
- [ ] Certificats SSL valides
- [ ] Base de données migrée
- [ ] Sauvegardes récentes disponibles

### Déploiement
- [ ] Pipeline CI/CD réussi
- [ ] Image Docker buildée et pushée
- [ ] Configuration Nginx mise à jour
- [ ] Services redémarrés
- [ ] Tests de santé OK

### Post-déploiement
- [ ] API répond correctement
- [ ] Monitoring actif
- [ ] Logs sans erreurs critiques
- [ ] Performance acceptable
- [ ] Notification équipe de réussite

## Support et contacts

- **Documentation**: `https://api.anime-kun.com/docs`
- **Monitoring**: `https://monitoring.anime-kun.com`
- **Logs**: `https://logs.anime-kun.com`
- **Support**: `devops@anime-kun.com`