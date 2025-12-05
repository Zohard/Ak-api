# API Testing Guide - Anime-Kun NestJS v3.0

Ce guide fournit des exemples complets pour tester tous les endpoints de l'API Anime-Kun.

## Configuration

### Base URL
- **Development**: `http://localhost:3003/api`
- **Production**: `https://api.anime-kun.com/api`

### Headers communs
```http
Content-Type: application/json
Authorization: Bearer <your_jwt_token>
```

## 1. Authentication

### Inscription
```bash
curl -X POST http://localhost:3003/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Password123!",
    "confirmPassword": "Password123!"
  }'
```

### Connexion
```bash
curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!"
  }'
```

**Réponse attendue**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": 123,
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  }
}
```

### Refresh Token
```bash
curl -X POST http://localhost:3003/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "your_refresh_token_here"
  }'
```

### Profil utilisateur
```bash
curl -X GET http://localhost:3003/api/auth/profile \
  -H "Authorization: Bearer your_jwt_token"
```

## 2. Users

### Mon profil
```bash
curl -X GET http://localhost:3003/api/users/me \
  -H "Authorization: Bearer your_jwt_token"
```

### Mettre à jour mon profil
```bash
curl -X PATCH http://localhost:3003/api/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "username": "newusername",
    "bio": "Ma nouvelle bio",
    "preferences": {
      "theme": "dark",
      "language": "fr"
    }
  }'
```

### Utilisateur par ID
```bash
curl -X GET http://localhost:3003/api/users/123 \
  -H "Authorization: Bearer your_jwt_token"
```

### Statistiques utilisateur
```bash
curl -X GET http://localhost:3003/api/users/123/stats \
  -H "Authorization: Bearer your_jwt_token"
```

## 3. Animes

### Liste des animes
```bash
curl -X GET "http://localhost:3003/api/animes?page=1&limit=20&sortBy=rating&genre=action" \
  -H "Authorization: Bearer your_jwt_token"
```

### Anime par ID
```bash
curl -X GET http://localhost:3003/api/animes/123 \
  -H "Authorization: Bearer your_jwt_token"
```

### Top animes
```bash
curl -X GET "http://localhost:3003/api/animes/top?limit=10" \
  -H "Authorization: Bearer your_jwt_token"
```

### Anime aléatoire
```bash
curl -X GET http://localhost:3003/api/animes/random \
  -H "Authorization: Bearer your_jwt_token"
```

### Genres disponibles
```bash
curl -X GET http://localhost:3003/api/animes/genres \
  -H "Authorization: Bearer your_jwt_token"
```

### Autocomplétion
```bash
curl -X GET "http://localhost:3003/api/animes/autocomplete?q=naru" \
  -H "Authorization: Bearer your_jwt_token"
```

### Créer un anime (Admin)
```bash
curl -X POST http://localhost:3003/api/animes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin_jwt_token" \
  -d '{
    "nomAnime": "Nouvel Anime",
    "synopsisAnime": "Description de l anime",
    "genreAnime": "Action",
    "noteAnime": 8.5,
    "statutAnime": "En cours",
    "dateDebut": "2024-01-01",
    "studio": "Studio Ghibli"
  }'
```

## 4. Mangas

### Liste des mangas
```bash
curl -X GET "http://localhost:3003/api/mangas?page=1&limit=20&minRating=7" \
  -H "Authorization: Bearer your_jwt_token"
```

### Manga par ID
```bash
curl -X GET http://localhost:3003/api/mangas/456 \
  -H "Authorization: Bearer your_jwt_token"
```

### Top mangas
```bash
curl -X GET "http://localhost:3003/api/mangas/top?limit=10" \
  -H "Authorization: Bearer your_jwt_token"
```

## 5. Reviews

### Liste des reviews
```bash
curl -X GET "http://localhost:3003/api/reviews?page=1&limit=20&type=anime" \
  -H "Authorization: Bearer your_jwt_token"
```

### Créer une review
```bash
curl -X POST http://localhost:3003/api/reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "contentType": "anime",
    "contentId": 123,
    "rating": 9,
    "title": "Excellente série!",
    "content": "Cette série m a vraiment marqué...",
    "spoilerWarning": false
  }'
```

### Mes reviews
```bash
curl -X GET http://localhost:3003/api/reviews/my-reviews \
  -H "Authorization: Bearer your_jwt_token"
```

### Reviews d'un utilisateur
```bash
curl -X GET http://localhost:3003/api/reviews/user/123 \
  -H "Authorization: Bearer your_jwt_token"
```

### Top reviews
```bash
curl -X GET http://localhost:3003/api/reviews/top \
  -H "Authorization: Bearer your_jwt_token"
```

## 6. Search (Nouveau)

### Recherche unifiée
```bash
curl -X GET "http://localhost:3003/api/search?q=naruto&type=all&minRating=8&genre=action&sortBy=rating&page=1&limit=20" \
  -H "Authorization: Bearer your_jwt_token"
```

### Recherche par type
```bash
curl -X GET "http://localhost:3003/api/search?q=dragon&type=anime" \
  -H "Authorization: Bearer your_jwt_token"
```

### Autocomplétion
```bash
curl -X GET "http://localhost:3003/api/search/autocomplete?q=one" \
  -H "Authorization: Bearer your_jwt_token"
```

### Recherches populaires
```bash
curl -X GET "http://localhost:3003/api/search/popular?limit=10" \
  -H "Authorization: Bearer your_jwt_token"
```

### Analytics de recherche
```bash
curl -X GET http://localhost:3003/api/search/analytics \
  -H "Authorization: Bearer your_jwt_token"
```

### Recommandations
```bash
curl -X GET http://localhost:3003/api/search/recommendations/anime/123 \
  -H "Authorization: Bearer your_jwt_token"
```

## 7. Media (Nouveau)

### Upload d'image
```bash
curl -X POST http://localhost:3003/api/media/upload \
  -H "Authorization: Bearer your_jwt_token" \
  -F "file=@/path/to/image.jpg" \
  -F "type=anime" \
  -F "relatedId=123"
```

### Récupérer un média
```bash
curl -X GET http://localhost:3003/api/media/789 \
  -H "Authorization: Bearer your_jwt_token"
```

### Médias par contenu
```bash
curl -X GET http://localhost:3003/api/media/content/123 \
  -H "Authorization: Bearer your_jwt_token"
```

### Supprimer un média
```bash
curl -X DELETE http://localhost:3003/api/media/789 \
  -H "Authorization: Bearer your_jwt_token"
```

### Statistiques admin
```bash
curl -X GET http://localhost:3003/api/media/admin/stats \
  -H "Authorization: Bearer admin_jwt_token"
```

### Upload en lot (Admin)
```bash
curl -X POST http://localhost:3003/api/media/admin/bulk-upload \
  -H "Authorization: Bearer admin_jwt_token" \
  -F "files=@/path/to/image1.jpg" \
  -F "files=@/path/to/image2.jpg" \
  -F "type=anime" \
  -F "relatedId=123"
```

## 8. Notifications (Nouveau)

### Mes notifications
```bash
curl -X GET "http://localhost:3003/api/notifications?page=1&limit=20&unreadOnly=true" \
  -H "Authorization: Bearer your_jwt_token"
```

### Statistiques notifications
```bash
curl -X GET http://localhost:3003/api/notifications/stats \
  -H "Authorization: Bearer your_jwt_token"
```

### Mes préférences
```bash
curl -X GET http://localhost:3003/api/notifications/preferences \
  -H "Authorization: Bearer your_jwt_token"
```

### Mettre à jour préférences
```bash
curl -X PATCH http://localhost:3003/api/notifications/preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "emailNewReview": true,
    "emailNewAnime": false,
    "emailSecurityAlerts": true,
    "emailMarketing": false
  }'
```

### Marquer comme lu
```bash
curl -X PATCH http://localhost:3003/api/notifications/456/read \
  -H "Authorization: Bearer your_jwt_token"
```

### Tout marquer comme lu
```bash
curl -X PATCH http://localhost:3003/api/notifications/read-all \
  -H "Authorization: Bearer your_jwt_token"
```

### Envoyer notification (Admin)
```bash
curl -X POST http://localhost:3003/api/notifications/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin_jwt_token" \
  -d '{
    "userId": 123,
    "type": "new_review",
    "title": "Nouvelle critique disponible",
    "message": "Une nouvelle critique a été ajoutée pour Naruto",
    "priority": "medium",
    "data": {
      "reviewId": 456,
      "animeId": 123
    }
  }'
```

### Diffusion (Admin)
```bash
curl -X POST http://localhost:3003/api/notifications/broadcast \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin_jwt_token" \
  -d '{
    "type": "new_anime",
    "title": "Nouvel anime ajouté",
    "message": "Un nouvel anime a été ajouté à la base de données",
    "priority": "low"
  }'
```

## 9. Admin

### Dashboard admin
```bash
curl -X GET http://localhost:3003/api/admin/dashboard \
  -H "Authorization: Bearer admin_jwt_token"
```

### Activité récente
```bash
curl -X GET http://localhost:3003/api/admin/activity \
  -H "Authorization: Bearer admin_jwt_token"
```

### Santé système
```bash
curl -X GET http://localhost:3003/api/admin/system/health \
  -H "Authorization: Bearer admin_jwt_token"
```

### Gestion utilisateurs
```bash
curl -X GET "http://localhost:3003/api/admin/users?page=1&limit=20&search=john" \
  -H "Authorization: Bearer admin_jwt_token"
```

### Statistiques utilisateurs
```bash
curl -X GET http://localhost:3003/api/admin/users/stats \
  -H "Authorization: Bearer admin_jwt_token"
```

### Bannir utilisateur
```bash
curl -X POST http://localhost:3003/api/admin/users/123/ban \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin_jwt_token" \
  -d '{
    "reason": "Violation des règles",
    "duration": "7d"
  }'
```

### Gestion contenu
```bash
curl -X GET "http://localhost:3003/api/admin/content?type=anime&status=pending" \
  -H "Authorization: Bearer admin_jwt_token"
```

### File de modération
```bash
curl -X GET http://localhost:3003/api/admin/moderation/queue \
  -H "Authorization: Bearer admin_jwt_token"
```

### Modérer review
```bash
curl -X POST http://localhost:3003/api/admin/moderation/reviews/456/moderate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin_jwt_token" \
  -d '{
    "action": "approve",
    "reason": "Contenu approprié"
  }'
```

## 10. Business

### Recherche entreprises
```bash
curl -X GET "http://localhost:3003/api/business/search?name=studio&type=animation" \
  -H "Authorization: Bearer your_jwt_token"
```

### Entreprise par ID
```bash
curl -X GET http://localhost:3003/api/business/123 \
  -H "Authorization: Bearer your_jwt_token"
```

### Enregistrer clic
```bash
curl -X POST http://localhost:3003/api/business/123/clicks \
  -H "Authorization: Bearer your_jwt_token"
```

## Tests avec Postman

### Collection Postman

1. Créer une nouvelle collection "Anime-Kun API v3.0"
2. Ajouter les variables d'environnement:
   - `baseUrl`: `http://localhost:3003/api`
   - `token`: `{{access_token}}` (sera rempli automatiquement)

### Script de pré-requête (Collection level)
```javascript
// Auto-refresh token si expiré
const token = pm.environment.get("access_token");
const tokenExpiry = pm.environment.get("token_expiry");

if (!token || (tokenExpiry && Date.now() > tokenExpiry)) {
    // Token expired, refresh it
    const refreshToken = pm.environment.get("refresh_token");
    
    if (refreshToken) {
        pm.sendRequest({
            url: pm.environment.get("baseUrl") + "/auth/refresh",
            method: "POST",
            header: {
                "Content-Type": "application/json"
            },
            body: {
                mode: "raw",
                raw: JSON.stringify({
                    refresh_token: refreshToken
                })
            }
        }, (err, res) => {
            if (!err && res.code === 200) {
                const response = res.json();
                pm.environment.set("access_token", response.access_token);
                pm.environment.set("token_expiry", Date.now() + (response.expires_in * 1000));
            }
        });
    }
}
```

### Script de post-réponse pour login
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.environment.set("access_token", response.access_token);
    pm.environment.set("refresh_token", response.refresh_token);
    pm.environment.set("token_expiry", Date.now() + (response.expires_in * 1000));
    pm.environment.set("user_id", response.user.id);
}
```

## Tests automatisés avec Newman

### Installation
```bash
npm install -g newman
```

### Exécution
```bash
newman run anime-kun-collection.json -e environment.json --reporters cli,html
```

## Codes d'état et gestion d'erreurs

### Codes de succès
- `200 OK` - Requête réussie
- `201 Created` - Ressource créée
- `204 No Content` - Suppression réussie

### Codes d'erreur
- `400 Bad Request` - Données invalides
- `401 Unauthorized` - Token manquant/invalide
- `403 Forbidden` - Permissions insuffisantes
- `404 Not Found` - Ressource non trouvée
- `409 Conflict` - Conflit (ex: email déjà utilisé)
- `422 Unprocessable Entity` - Validation échouée
- `429 Too Many Requests` - Rate limit dépassé
- `500 Internal Server Error` - Erreur serveur

### Exemple de réponse d'erreur
```json
{
  "statusCode": 400,
  "message": [
    "email must be a valid email address",
    "password must be at least 8 characters long"
  ],
  "error": "Bad Request",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "path": "/api/auth/register"
}
```

## Rate Limiting

L'API implémente un rate limiting:
- **Authentification**: 5 tentatives par minute
- **API générale**: 100 requêtes par minute par IP
- **Upload**: 10 uploads par minute par utilisateur

Headers de rate limiting:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642428600
```

## WebSockets (Futur)

Endpoints WebSocket prévus pour Phase 7:
- `/ws/notifications` - Notifications temps réel
- `/ws/chat` - Chat en temps réel
- `/ws/activity` - Activité utilisateur

## Documentation interactive

Swagger UI disponible à:
- **Dev**: http://localhost:3003/docs
- **Prod**: https://api.anime-kun.com/docs

La documentation inclut:
- Tous les endpoints avec exemples
- Schémas de données
- Tests interactifs
- Codes d'erreur détaillés