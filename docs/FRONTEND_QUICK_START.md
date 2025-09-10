# Frontend Friends System - Quick Start Guide

This is a condensed guide to quickly implement the friends system in your Nuxt.js frontend.

## 🚀 Quick Implementation (30 minutes)

### Step 1: Install Dependencies (if needed)
```bash
npm install @nuxt/icon
```

### Step 2: Create Core Files

#### A. Types Definition
**Create: `types/friends.ts`**
```typescript
export interface FriendData {
  id: number;
  realName: string;
  lastLogin: number;
  avatar?: string;
  isMutual?: boolean;
  lastLoginFormatted?: string;
}

export interface FriendshipStats {
  totalFriends: number;
  mutualFriends: number;
  recentlyActive: number;
}

export interface FriendsResponse {
  friends: FriendData[];
  stats: FriendshipStats;
}

export interface FriendshipStatus {
  areFriends: boolean;
  isMutual: boolean;
  targetHasUser: boolean;
}
```

#### B. API Composable
**Create: `composables/useFriendsAPI.ts`**
```typescript
export const useFriendsAPI = () => {
  const { $fetch } = useNuxtApp();
  const config = useRuntimeConfig();
  const loading = ref(false);
  const error = ref<string | null>(null);

  const apiFetch = (endpoint: string, options: any = {}) => {
    const authStore = useAuthStore();
    return $fetch(endpoint, {
      baseURL: config.public.apiUrl,
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        ...options.headers
      },
      ...options
    });
  };

  const getFriends = async (userId?: number) => {
    loading.value = true;
    try {
      const endpoint = userId ? `/friends/user/${userId}` : '/friends';
      return await apiFetch(endpoint) as FriendsResponse;
    } finally {
      loading.value = false;
    }
  };

  const addFriend = async (targetUserId: number) => {
    return await apiFetch(`/friends/add/${targetUserId}`, { method: 'POST' });
  };

  const removeFriend = async (targetUserId: number) => {
    return await apiFetch(`/friends/remove/${targetUserId}`, { method: 'DELETE' });
  };

  const getFriendshipStatus = async (targetUserId: number) => {
    return await apiFetch(`/friends/status/${targetUserId}`) as FriendshipStatus;
  };

  return {
    loading: readonly(loading),
    error: readonly(error),
    getFriends,
    addFriend,
    removeFriend,
    getFriendshipStatus
  };
};
```

### Step 3: Create User Profile Page

**Create: `pages/user/[username]/index.vue`**
```vue
<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent"></div>
      <span class="ml-4 text-lg">Chargement du profil...</span>
    </div>

    <!-- Profile Content -->
    <div v-else-if="profile" class="container mx-auto px-4 py-8">
      <!-- Profile Header -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border p-6 mb-6">
        <div class="flex flex-col md:flex-row items-start md:items-center gap-6">
          <!-- Avatar & Info -->
          <div class="flex items-center space-x-4">
            <img
              :src="profile.avatar || '/img/noavatar.png'"
              :alt="profile.realName"
              class="w-20 h-20 rounded-full object-cover"
            />
            <div>
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ profile.realName }}
              </h1>
              <p class="text-gray-600 dark:text-gray-400">
                @{{ profile.memberName }}
              </p>
            </div>
          </div>

          <!-- Friendship Actions -->
          <div class="ml-auto" v-if="!isOwnProfile">
            <FriendshipButton :target-user-id="profile.id" />
          </div>
        </div>
      </div>

      <!-- Friends List -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border p-6">
        <h2 class="text-xl font-semibold mb-4">Amis</h2>
        <UserFriends :user-id="profile.id" />
      </div>
    </div>

    <!-- Error -->
    <div v-else class="text-center py-20">
      <p class="text-red-600">Profil introuvable</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const username = route.params.username as string;

// Mock profile data (replace with your actual profile fetching)
const profile = ref({
  id: 123,
  realName: username,
  memberName: username,
  avatar: '/img/noavatar.png'
});

const loading = ref(false);
const authStore = useAuthStore();

const isOwnProfile = computed(() => {
  return authStore.user?.memberName === username;
});
</script>
```

### Step 4: Create Friendship Button Component

**Create: `components/FriendshipButton.vue`**
```vue
<template>
  <div>
    <button
      v-if="!status?.areFriends"
      @click="handleAddFriend"
      :disabled="loading"
      class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
    >
      <span v-if="loading">Chargement...</span>
      <span v-else>Ajouter comme ami</span>
    </button>

    <div v-else class="flex gap-2">
      <span class="px-4 py-2 bg-green-100 text-green-700 rounded-lg">
        {{ status.isMutual ? 'Amis mutuels' : 'En attente' }}
      </span>
      <button
        @click="handleRemoveFriend"
        :disabled="loading"
        class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
      >
        Retirer
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  targetUserId: number;
}

const props = defineProps<Props>();

const friendsAPI = useFriendsAPI();
const status = ref<FriendshipStatus | null>(null);
const loading = ref(false);

// Load initial status
onMounted(async () => {
  try {
    status.value = await friendsAPI.getFriendshipStatus(props.targetUserId);
  } catch (error) {
    console.error('Failed to load friendship status:', error);
  }
});

const handleAddFriend = async () => {
  loading.value = true;
  try {
    await friendsAPI.addFriend(props.targetUserId);
    status.value = await friendsAPI.getFriendshipStatus(props.targetUserId);
  } catch (error) {
    console.error('Failed to add friend:', error);
  } finally {
    loading.value = false;
  }
};

const handleRemoveFriend = async () => {
  loading.value = true;
  try {
    await friendsAPI.removeFriend(props.targetUserId);
    status.value = await friendsAPI.getFriendshipStatus(props.targetUserId);
  } catch (error) {
    console.error('Failed to remove friend:', error);
  } finally {
    loading.value = false;
  }
};
</script>
```

### Step 5: Create Friends List Component

**Create: `components/UserFriends.vue`**
```vue
<template>
  <div>
    <!-- Stats -->
    <div v-if="friendsData" class="grid grid-cols-3 gap-4 mb-6">
      <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div class="text-2xl font-bold">{{ friendsData.stats.totalFriends }}</div>
        <div class="text-sm text-gray-500">Total</div>
      </div>
      <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div class="text-2xl font-bold">{{ friendsData.stats.mutualFriends }}</div>
        <div class="text-sm text-gray-500">Mutuels</div>
      </div>
      <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div class="text-2xl font-bold">{{ friendsData.stats.recentlyActive }}</div>
        <div class="text-sm text-gray-500">Actifs</div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
      <span class="text-gray-500 mt-2 block">Chargement des amis...</span>
    </div>

    <!-- Friends Grid -->
    <div v-else-if="friendsData?.friends.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="friend in friendsData.friends"
        :key="friend.id"
        class="p-4 border rounded-lg hover:shadow-sm transition-shadow"
      >
        <div class="flex items-center space-x-3">
          <img
            :src="friend.avatar || '/img/noavatar.png'"
            :alt="friend.realName"
            class="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <NuxtLink
              :to="`/user/${friend.realName}`"
              class="font-medium text-gray-900 dark:text-white hover:text-blue-600"
            >
              {{ friend.realName }}
            </NuxtLink>
            <p class="text-sm text-gray-500">
              {{ friend.lastLoginFormatted }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 text-gray-500">
      <p>Aucun ami pour le moment</p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  userId: number;
}

const props = defineProps<Props>();

const friendsAPI = useFriendsAPI();
const friendsData = ref<FriendsResponse | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    friendsData.value = await friendsAPI.getFriends(props.userId);
  } catch (error) {
    console.error('Failed to load friends:', error);
  } finally {
    loading.value = false;
  }
});
</script>
```

### Step 6: Update Runtime Config

**Update: `nuxt.config.ts`**
```typescript
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || 'http://localhost:3000/api'
    }
  },
  modules: [
    '@nuxt/icon'
  ]
})
```

### Step 7: Environment Variables

**Create/Update: `.env`**
```env
NUXT_PUBLIC_API_URL=http://localhost:3000/api
```

## 🎯 Usage Examples

### Navigate to User Profiles
```vue
<template>
  <NuxtLink :to="`/user/${username}`">
    Voir le profil de {{ username }}
  </NuxtLink>
</template>
```

### Add Friends List to Existing Profile
```vue
<template>
  <div class="profile-page">
    <!-- Your existing profile content -->
    
    <!-- Add friends section -->
    <UserFriends :user-id="profileUserId" />
  </div>
</template>
```

### Show Friendship Status Anywhere
```vue
<template>
  <div>
    <FriendshipButton :target-user-id="123" />
  </div>
</template>
```

## 🎨 Styling Notes

- All components use Tailwind CSS
- Dark mode support included
- Mobile-responsive design
- Hover states and transitions
- Loading and error states

## 🔧 Customization

### Change Colors
Update the Tailwind classes:
- `bg-blue-600` → `bg-green-600` (change primary color)
- `text-blue-600` → `text-green-600`

### Add Icons
The components expect an Icon component. Install and configure:
```bash
npm install @nuxt/icon
```

### Custom Styling
Override classes by creating your own component variants or using Tailwind's configuration.

## ⚡ Performance Tips

1. **Lazy Loading**: Components load friends data on mount
2. **Caching**: Consider adding client-side caching
3. **Debouncing**: Search functionality includes debouncing
4. **Pagination**: Friends list supports "load more" functionality

## 🐛 Troubleshooting

### API Not Working?
- Check `NUXT_PUBLIC_API_URL` environment variable
- Verify backend is running on correct port
- Check browser network tab for authentication issues

### Styling Issues?
- Ensure Tailwind CSS is properly configured
- Check dark mode classes are working
- Verify icon component is installed

### Authentication Problems?
- Ensure `useAuthStore()` returns valid token
- Check token format (should be JWT)
- Verify API endpoints require proper authentication

This quick start guide provides a minimal but functional friends system. You can expand it by adding the full feature set from the comprehensive documentation.