# Configuration reCAPTCHA v3

## Problème actuel

La clé reCAPTCHA actuelle (`6LfIXd4rAAAAAIWWZ40Ao7ansjC0g8T09D02_To1`) n'est pas autorisée pour votre domaine Vercel.

## Solution : Reconfigurer reCAPTCHA dans Google Console

### 1. Accédez à la console Google reCAPTCHA

Allez sur : https://www.google.com/recaptcha/admin

### 2. Modifiez votre site reCAPTCHA existant

Trouvez votre site reCAPTCHA avec la clé `6LfIXd4rAAAAAIWWZ40Ao7ansjC0g8T09D02_To1` et cliquez sur "Settings" (⚙️)

### 3. Ajoutez vos domaines autorisés

Dans la section **Domains**, ajoutez TOUS vos domaines :

```
localhost
127.0.0.1
ak-api-three.vercel.app
votredomaine-frontend.vercel.app
votredomaine-production.com
```

**Important :**
- N'incluez PAS `http://` ou `https://`
- Ajoutez chaque domaine/sous-domaine sur une ligne séparée
- Incluez `localhost` pour le développement local

### 4. Vérifiez le type de reCAPTCHA

Assurez-vous que le type est **reCAPTCHA v3** (pas v2)

### 5. Récupérez vos clés

Une fois les domaines ajoutés :

- **Site Key (clé publique)** : `6LfIXd4rAAAAAIWWZ40Ao7ansjC0g8T09D02_To1`
- **Secret Key (clé secrète)** : `6LfIXd4rAAAAAP36L9HW6ldPVGAFYdUTLKbNoXuX`

### 6. Configurez les variables d'environnement dans Vercel

#### Frontend (frontendv2)

```env
RECAPTCHA_SITE_KEY=6LfIXd4rAAAAAIWWZ40Ao7ansjC0g8T09D02_To1
ENABLE_RECAPTCHA=true  # Set to 'true' to enable reCAPTCHA validation
```

**Important:** Laissez `ENABLE_RECAPTCHA=false` jusqu'à ce que vous ayez correctement configuré les domaines dans la console Google reCAPTCHA.

#### Backend (anime-kun-nestjs-v2)

```env
RECAPTCHA_SECRET_KEY=6LfIXd4rAAAAAP36L9HW6ldPVGAFYdUTLKbNoXuX
```

### 7. Redéployez les applications

Après avoir mis à jour les variables d'environnement dans Vercel, redéployez les deux applications pour que les changements prennent effet.

## Fonctionnement du fallback actuel

En attendant que reCAPTCHA soit correctement configuré, l'application utilise un système de fallback :

1. **Si reCAPTCHA est configuré et fonctionne** → Validation normale
2. **Si reCAPTCHA échoue ou n'est pas configuré** → Utilise le token `bypass-no-recaptcha`
3. **Backend en développement** → Accepte tous les bypass tokens
4. **Backend en production sans clé configurée** → Accepte les bypass tokens

Cela permet à l'inscription de fonctionner même si reCAPTCHA n'est pas encore configuré.

## Test de la configuration

Pour vérifier si reCAPTCHA fonctionne :

1. Ouvrez la console du navigateur (F12)
2. Allez sur la page d'inscription
3. Remplissez le formulaire et soumettez
4. Vérifiez les logs :
   - ✅ `reCAPTCHA token obtained successfully` = reCAPTCHA fonctionne
   - ⚠️ `reCAPTCHA not available, using fallback token` = reCAPTCHA non configuré
   - ❌ `reCAPTCHA error: ...` = Erreur de configuration

## Alternative : Créer un nouveau site reCAPTCHA

Si vous préférez créer un nouveau site reCAPTCHA :

1. Allez sur https://www.google.com/recaptcha/admin/create
2. Choisissez **reCAPTCHA v3**
3. Ajoutez vos domaines (voir étape 3 ci-dessus)
4. Récupérez les nouvelles clés
5. Mettez à jour les variables d'environnement Vercel
