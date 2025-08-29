# Migration Guide: PHP to NestJS API

Ce guide décrit comment migrer de l'ancienne API PHP vers la nouvelle API NestJS v3.0.

## Vue d'ensemble des changements

### Architecture
- **Ancien**: PHP avec structure MVC personnalisée
- **Nouveau**: NestJS avec TypeScript, architecture modulaire

### Base de données
- **Ancien**: MySQL avec requêtes SQL directes
- **Nouveau**: PostgreSQL avec Prisma ORM

### Authentification
- **Ancien**: Sessions PHP + cookies
- **Nouveau**: JWT Bearer tokens

## Changements d'endpoints

### Authentication

| Ancien endpoint | Nouveau endpoint | Méthode | Notes |
|----------------|------------------|---------|-------|
| `/login.php` | `/api/auth/login` | POST | Retourne JWT token |
| `/register.php` | `/api/auth/register` | POST | Validation renforcée |
| `/logout.php` | - | - | Client-side token removal |
| - | `/api/auth/refresh` | POST | Nouveau: refresh tokens |
| - | `/api/auth/forgot-password` | POST | Nouveau: récupération mot de passe |
| - | `/api/auth/reset-password` | POST | Nouveau: réinitialisation |

### Users

| Ancien endpoint | Nouveau endpoint | Méthode | Changements |
|----------------|------------------|---------|-------------|
| `/profile.php` | `/api/users/me` | GET | Structure JSON standardisée |
| `/profile.php` | `/api/users/me` | PATCH | Validation TypeScript |
| `/users.php?id=123` | `/api/users/123` | GET | URL RESTful |
| - | `/api/users/123/stats` | GET | Nouveau: statistiques utilisateur |

### Animes

| Ancien endpoint | Nouveau endpoint | Méthode | Améliorations |
|----------------|------------------|---------|---------------|
| `/animes.php` | `/api/animes` | GET | Pagination standardisée |
| `/animes.php?id=123` | `/api/animes/123` | GET | Détails enrichis |
| `/animes.php` | `/api/animes` | POST | Validation stricte |
| `/anime_search.php` | `/api/search?type=anime` | GET | Recherche unifiée |
| - | `/api/animes/top` | GET | Nouveau: top animes |
| - | `/api/animes/random` | GET | Nouveau: anime aléatoire |
| - | `/api/animes/genres` | GET | Nouveau: liste des genres |
| - | `/api/animes/autocomplete` | GET | Nouveau: autocomplétion |

### Mangas

| Ancien endpoint | Nouveau endpoint | Méthode | Améliorations |
|----------------|------------------|---------|---------------|
| `/mangas.php` | `/api/mangas` | GET | Pagination cohérente |
| `/mangas.php?id=123` | `/api/mangas/123` | GET | Structure standardisée |
| `/manga_search.php` | `/api/search?type=manga` | GET | Recherche avancée |

### Reviews

| Ancien endpoint | Nouveau endpoint | Méthode | Nouveautés |
|----------------|------------------|---------|------------|
| `/reviews.php` | `/api/reviews` | GET | Filtres avancés |
| `/reviews.php` | `/api/reviews` | POST | Validation renforcée |
| `/reviews.php?id=123` | `/api/reviews/123` | GET | Métadonnées enrichies |
| - | `/api/reviews/user/123` | GET | Nouveau: reviews par utilisateur |
| - | `/api/reviews/my-reviews` | GET | Nouveau: mes reviews |
| - | `/api/reviews/top` | GET | Nouveau: meilleures reviews |

### Nouveaux modules

#### Search (Nouveau)
- `/api/search` - Recherche unifiée animes/mangas
- `/api/search/autocomplete` - Suggestions de recherche
- `/api/search/popular` - Recherches populaires
- `/api/search/analytics` - Statistiques de recherche
- `/api/search/recommendations/:type/:id` - Recommandations

#### Media (Nouveau)
- `/api/media/upload` - Upload d'images
- `/api/media/:id` - Récupération média
- `/api/media/content/:relatedId` - Médias par contenu
- `/api/media/admin/stats` - Statistiques admin

#### Notifications (Nouveau)
- `/api/notifications` - Liste des notifications
- `/api/notifications/preferences` - Préférences utilisateur
- `/api/notifications/stats` - Statistiques
- `/api/notifications/send` - Envoi notification (admin)
- `/api/notifications/broadcast` - Diffusion (admin)

#### Admin (Amélioré)
- `/api/admin/dashboard` - Tableau de bord
- `/api/admin/users` - Gestion utilisateurs
- `/api/admin/content` - Gestion contenu
- `/api/admin/moderation` - File de modération

## Changements de format de données

### Authentication Response
```php
// Ancien (PHP)
session_start();
$_SESSION['user_id'] = $user_id;
echo json_encode(['success' => true]);
```

```json
// Nouveau (NestJS)
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": 123,
    "username": "user",
    "email": "user@example.com",
    "role": "user"
  }
}
```

### Pagination
```php
// Ancien (PHP)
{
  "data": [...],
  "total": 100,
  "page": 1
}
```

```json
// Nouveau (NestJS)
{
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 100,
    "itemsPerPage": 10,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

### Error Handling
```php
// Ancien (PHP)
{
  "error": "User not found",
  "code": 404
}
```

```json
// Nouveau (NestJS)
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "path": "/api/users/999"
}
```

## Headers HTTP requis

### Authentication
```http
// Ancien (PHP)
Cookie: PHPSESSID=abc123...

// Nouveau (NestJS)
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Content-Type
```http
Content-Type: application/json
```

## Gestion des erreurs

### Codes d'état HTTP standardisés
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (no token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `500` - Internal Server Error

### Structure des erreurs de validation
```json
{
  "statusCode": 400,
  "message": [
    "email must be a valid email",
    "password must be at least 8 characters"
  ],
  "error": "Bad Request"
}
```

## Migration steps

### 1. Mise à jour de l'authentification

```javascript
// Ancien
fetch('/login.php', {
  method: 'POST',
  credentials: 'include',
  body: formData
});

// Nouveau
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { access_token } = await response.json();
localStorage.setItem('token', access_token);
```

### 2. Mise à jour des appels API

```javascript
// Ancien
fetch('/animes.php?page=1&limit=20');

// Nouveau
fetch('/api/animes?page=1&limit=20', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});
```

### 3. Gestion des erreurs

```javascript
// Nouveau pattern pour la gestion d'erreurs
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API Error');
    }

    return await response.json();
  } catch (error) {
    console.error('API Call failed:', error);
    throw error;
  }
}
```

## Nouvelles fonctionnalités

### 1. Recherche avancée
```javascript
// Recherche unifiée avec filtres
const results = await fetch('/api/search?q=naruto&type=anime&minRating=8&genre=action&sortBy=rating');
```

### 2. Upload de médias
```javascript
const formData = new FormData();
formData.append('file', imageFile);
formData.append('type', 'anime');
formData.append('relatedId', '123');

const media = await fetch('/api/media/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### 3. Notifications
```javascript
// S'abonner aux notifications
const notifications = await fetch('/api/notifications');

// Mettre à jour les préférences
await fetch('/api/notifications/preferences', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    emailNewReview: true,
    emailSecurityAlerts: true
  })
});
```

## Performance et optimisations

### 1. Pagination efficace
L'API utilise maintenant une pagination basée sur les offsets avec des métadonnées complètes.

### 2. Cache intelligent
Les réponses courantes sont mises en cache pour améliorer les performances.

### 3. Compression automatique
Toutes les réponses sont compressées automatiquement.

## Sécurité renforcée

### 1. Validation TypeScript
Toutes les entrées sont validées avec class-validator.

### 2. Rate limiting
Protection contre les abus avec limitation de taux.

### 3. CORS configuré
Configuration CORS stricte pour la sécurité.

### 4. Headers de sécurité
Headers de sécurité automatiques (HSTS, CSP, etc.).

## Documentation interactive

La nouvelle API inclut une documentation Swagger interactive disponible à:
- **Development**: `http://localhost:3003/docs`
- **Production**: `https://api.anime-kun.com/docs`

## Support

Pour toute question concernant la migration:
- Documentation: `/docs`
- Issues: GitHub repository
- Email: dev@anime-kun.com

## Roadmap

### Phase 7 (Prochaine)
- WebSockets pour les notifications temps réel
- Cache Redis avancé
- Optimisations de performance supplémentaires