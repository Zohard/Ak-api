# Frontend Friends System Implementation Guide

This document provides comprehensive implementation guidelines for integrating the Friends Management System into the Nuxt.js frontend (`frontendv2`).

## 📋 Overview

The frontend implementation will include:
- User profile pages with friendship management
- Friends list display on profiles
- Friend request/management components
- Search and discovery features
- Real-time friendship status updates

## 🏗️ Architecture

### File Structure
```
frontendv2/
├── pages/
│   ├── user/
│   │   └── [username]/
│   │       └── index.vue          # User Profile Page
├── components/
│   ├── user/
│   │   ├── UserProfile.vue        # Main profile component
│   │   ├── UserFriends.vue        # Friends list component
│   │   ├── FriendshipActions.vue  # Add/Remove friend buttons
│   │   └── FriendSearch.vue       # Search for friends
├── composables/
│   ├── useFriendsAPI.ts           # Friends API integration
│   ├── useUserProfile.ts          # User profile management
│   └── useFriendship.ts           # Friendship status management
└── types/
    └── friends.ts                 # TypeScript interfaces
```

## 🔧 Implementation Steps

### Step 1: Create TypeScript Types

First, create the type definitions for the friends system:

**File: `types/friends.ts`**

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

export interface FriendshipActionResponse {
  success: boolean;
  message: string;
  isMutual?: boolean;
}

export interface SearchResult {
  id: number;
  realName: string;
  avatar: string;
  areFriends: boolean;
  isMutual: boolean;
}

export interface UserProfile {
  id: number;
  realName: string;
  memberName: string;
  avatar?: string;
  dateRegistered: string;
  posts: number;
  lastLogin: number;
  // Add other profile fields as needed
}
```

### Step 2: Create Friends API Composable

**File: `composables/useFriendsAPI.ts`**

```typescript
interface FriendsAPIOptions {
  immediate?: boolean;
}

export const useFriendsAPI = (options: FriendsAPIOptions = {}) => {
  const { $fetch } = useNuxtApp();
  const config = useRuntimeConfig();
  
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Create authenticated fetch instance
  const apiFetch = (endpoint: string, options: any = {}) => {
    const authStore = useAuthStore();
    return $fetch(endpoint, {
      baseURL: config.public.apiUrl || 'http://localhost:3000/api',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        ...options.headers
      },
      ...options
    });
  };

  // Get user's friends list
  const getFriends = async (userId?: number) => {
    loading.value = true;
    error.value = null;
    
    try {
      const endpoint = userId ? `/friends/user/${userId}` : '/friends';
      const response = await apiFetch(endpoint) as FriendsResponse;
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch friends';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Add friend
  const addFriend = async (targetUserId: number) => {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await apiFetch(`/friends/add/${targetUserId}`, {
        method: 'POST'
      }) as FriendshipActionResponse;
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to add friend';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Remove friend
  const removeFriend = async (targetUserId: number) => {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await apiFetch(`/friends/remove/${targetUserId}`, {
        method: 'DELETE'
      }) as FriendshipActionResponse;
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to remove friend';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Check friendship status
  const getFriendshipStatus = async (targetUserId: number) => {
    try {
      const response = await apiFetch(`/friends/status/${targetUserId}`) as FriendshipStatus;
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to get friendship status';
      throw err;
    }
  };

  // Get mutual friends
  const getMutualFriends = async (targetUserId: number) => {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await apiFetch(`/friends/mutual/${targetUserId}`) as FriendData[];
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to get mutual friends';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Search users
  const searchUsers = async (query: string, limit = 10) => {
    if (query.length < 2) return [];
    
    loading.value = true;
    error.value = null;
    
    try {
      const response = await apiFetch(`/friends/search?q=${encodeURIComponent(query)}&limit=${limit}`) as SearchResult[];
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to search users';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Get friend recommendations
  const getFriendRecommendations = async (limit = 5) => {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await apiFetch(`/friends/recommendations?limit=${limit}`);
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to get recommendations';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    loading: readonly(loading),
    error: readonly(error),
    getFriends,
    addFriend,
    removeFriend,
    getFriendshipStatus,
    getMutualFriends,
    searchUsers,
    getFriendRecommendations
  };
};
```

### Step 3: Create User Profile Composable

**File: `composables/useUserProfile.ts`**

```typescript
export const useUserProfile = (username?: string) => {
  const { $fetch } = useNuxtApp();
  const config = useRuntimeConfig();
  
  const loading = ref(false);
  const error = ref<string | null>(null);
  const profile = ref<UserProfile | null>(null);

  // Fetch user profile by username or ID
  const fetchProfile = async (identifier: string | number) => {
    loading.value = true;
    error.value = null;
    
    try {
      // This endpoint needs to be implemented in your backend
      const endpoint = typeof identifier === 'string' 
        ? `/users/profile/${identifier}` 
        : `/users/${identifier}`;
        
      const response = await $fetch(endpoint, {
        baseURL: config.public.apiUrl || 'http://localhost:3000/api'
      }) as UserProfile;
      
      profile.value = response;
      return response;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch profile';
      profile.value = null;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Auto-fetch if username provided
  if (username) {
    fetchProfile(username);
  }

  return {
    profile: readonly(profile),
    loading: readonly(loading),
    error: readonly(error),
    fetchProfile,
    refresh: () => username ? fetchProfile(username) : null
  };
};
```

### Step 4: Create Friendship Management Composable

**File: `composables/useFriendship.ts`**

```typescript
export const useFriendship = (targetUserId?: number) => {
  const friendsAPI = useFriendsAPI();
  
  const status = ref<FriendshipStatus | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Load friendship status
  const loadStatus = async (userId: number) => {
    if (!userId) return;
    
    loading.value = true;
    error.value = null;
    
    try {
      const response = await friendsAPI.getFriendshipStatus(userId);
      status.value = response;
      return response;
    } catch (err: any) {
      error.value = err.message;
      status.value = null;
    } finally {
      loading.value = false;
    }
  };

  // Add friend with status update
  const addFriend = async (userId: number) => {
    try {
      const response = await friendsAPI.addFriend(userId);
      // Refresh status after successful addition
      await loadStatus(userId);
      return response;
    } catch (err) {
      throw err;
    }
  };

  // Remove friend with status update
  const removeFriend = async (userId: number) => {
    try {
      const response = await friendsAPI.removeFriend(userId);
      // Refresh status after successful removal
      await loadStatus(userId);
      return response;
    } catch (err) {
      throw err;
    }
  };

  // Auto-load status if targetUserId provided
  if (targetUserId) {
    loadStatus(targetUserId);
  }

  return {
    status: readonly(status),
    loading: readonly(loading),
    error: readonly(error),
    loadStatus,
    addFriend,
    removeFriend,
    refresh: () => targetUserId ? loadStatus(targetUserId) : null
  };
};
```

### Step 5: Create User Profile Page

**File: `pages/user/[username]/index.vue`**

```vue
<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Loading State -->
    <div v-if="profileLoading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent"></div>
      <span class="ml-4 text-lg text-gray-600 dark:text-gray-300">Chargement du profil...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="profileError" class="container mx-auto px-4 py-20">
      <div class="max-w-md mx-auto text-center">
        <Icon name="heroicons:exclamation-triangle" class="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Profil introuvable</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">{{ profileError }}</p>
        <NuxtLink to="/" class="btn-primary">
          Retour à l'accueil
        </NuxtLink>
      </div>
    </div>

    <!-- Profile Content -->
    <div v-else-if="profile" class="container mx-auto px-4 py-8">
      <!-- Profile Header -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div class="flex flex-col md:flex-row items-start md:items-center gap-6">
          <!-- Avatar -->
          <div class="flex-shrink-0">
            <img
              :src="profile.avatar || '/img/noavatar.png'"
              :alt="profile.realName"
              class="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover"
            />
          </div>

          <!-- Profile Info -->
          <div class="flex-1">
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {{ profile.realName }}
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              @{{ profile.memberName }}
            </p>
            
            <div class="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <div class="flex items-center space-x-1">
                <Icon name="heroicons:calendar" class="w-4 h-4" />
                <span>Membre depuis {{ formatDate(profile.dateRegistered) }}</span>
              </div>
              <div class="flex items-center space-x-1">
                <Icon name="heroicons:chat-bubble-left" class="w-4 h-4" />
                <span>{{ profile.posts }} posts</span>
              </div>
              <div class="flex items-center space-x-1">
                <Icon name="heroicons:clock" class="w-4 h-4" />
                <span>Vu {{ formatLastLogin(profile.lastLogin) }}</span>
              </div>
            </div>
          </div>

          <!-- Friendship Actions -->
          <div class="flex-shrink-0">
            <FriendshipActions 
              v-if="!isOwnProfile"
              :target-user-id="profile.id"
              :target-username="profile.realName"
            />
          </div>
        </div>
      </div>

      <!-- Profile Content Tabs -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <!-- Tab Navigation -->
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav class="-mb-px flex space-x-8 px-6">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              ]"
            >
              <Icon :name="tab.icon" class="w-4 h-4 inline mr-2" />
              {{ tab.label }}
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="p-6">
          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Recent Activity placeholder -->
              <div class="space-y-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  Activité récente
                </h3>
                <div class="text-gray-500 dark:text-gray-400">
                  Aucune activité récente
                </div>
              </div>

              <!-- Statistics -->
              <div class="space-y-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  Statistiques
                </h3>
                <div class="grid grid-cols-2 gap-4">
                  <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">
                      {{ friendsData?.stats.totalFriends || 0 }}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      Amis
                    </div>
                  </div>
                  <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">
                      {{ profile.posts }}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      Posts
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Friends Tab -->
          <div v-else-if="activeTab === 'friends'">
            <UserFriends 
              :user-id="profile.id" 
              :show-mutual-friends="!isOwnProfile"
              :current-user-id="authStore.user?.id"
            />
          </div>

          <!-- Reviews Tab -->
          <div v-else-if="activeTab === 'reviews'" class="text-gray-500 dark:text-gray-400">
            Critiques à implémenter
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FriendshipActions from '~/components/user/FriendshipActions.vue';
import UserFriends from '~/components/user/UserFriends.vue';

// Get route parameter
const route = useRoute();
const username = route.params.username as string;

// Composables
const { profile, loading: profileLoading, error: profileError } = useUserProfile(username);
const authStore = useAuthStore();
const friendsAPI = useFriendsAPI();

// State
const activeTab = ref('overview');
const friendsData = ref<FriendsResponse | null>(null);

// Computed
const isOwnProfile = computed(() => {
  return authStore.user?.id === profile.value?.id;
});

const tabs = computed(() => [
  { id: 'overview', label: 'Aperçu', icon: 'heroicons:user' },
  { id: 'friends', label: `Amis (${friendsData.value?.stats.totalFriends || 0})`, icon: 'heroicons:users' },
  { id: 'reviews', label: 'Critiques', icon: 'heroicons:star' },
]);

// Load friends data when profile is loaded
watch(profile, async (newProfile) => {
  if (newProfile) {
    try {
      friendsData.value = await friendsAPI.getFriends(newProfile.id);
    } catch (error) {
      console.error('Failed to load friends data:', error);
    }
  }
}, { immediate: true });

// Utility functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const formatLastLogin = (timestamp: number) => {
  if (!timestamp) return 'jamais';
  
  const now = Date.now() / 1000;
  const daysDiff = Math.floor((now - timestamp) / (24 * 60 * 60));
  
  if (daysDiff <= 0) return "aujourd'hui";
  if (daysDiff === 1) return 'hier';
  return `il y a ${daysDiff} jours`;
};

// SEO
useHead({
  title: () => profile.value ? `${profile.value.realName} - Profil` : 'Profil utilisateur',
  meta: [
    {
      name: 'description',
      content: () => profile.value 
        ? `Profil de ${profile.value.realName} sur Anime-Kun`
        : 'Profil utilisateur sur Anime-Kun'
    }
  ]
});
</script>
```

### Step 6: Create Friendship Actions Component

**File: `components/user/FriendshipActions.vue`**

```vue
<template>
  <div class="flex flex-col sm:flex-row gap-2">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center p-2">
      <div class="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
      <span class="ml-2 text-sm text-gray-600 dark:text-gray-300">Chargement...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-sm text-red-500">
      {{ error }}
    </div>

    <!-- Friendship Actions -->
    <template v-else-if="status">
      <!-- Already Friends - Mutual -->
      <div v-if="status.areFriends && status.isMutual" class="flex gap-2">
        <button
          @click="handleRemoveFriend"
          :disabled="actionLoading"
          class="flex items-center px-4 py-2 text-sm bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
        >
          <Icon name="heroicons:user-minus" class="w-4 h-4 mr-2" />
          Retirer des amis
        </button>
        <span class="flex items-center px-3 py-2 text-sm bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-lg">
          <Icon name="heroicons:heart" class="w-4 h-4 mr-2" />
          Amis mutuels
        </span>
      </div>

      <!-- You added them, but they haven't added you back -->
      <div v-else-if="status.areFriends && !status.targetHasUser" class="flex gap-2">
        <button
          @click="handleRemoveFriend"
          :disabled="actionLoading"
          class="flex items-center px-4 py-2 text-sm bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
        >
          <Icon name="heroicons:user-minus" class="w-4 h-4 mr-2" />
          Retirer des amis
        </button>
        <span class="flex items-center px-3 py-2 text-sm bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 rounded-lg">
          <Icon name="heroicons:clock" class="w-4 h-4 mr-2" />
          En attente
        </span>
      </div>

      <!-- They added you, but you haven't added them back -->
      <div v-else-if="!status.areFriends && status.targetHasUser" class="flex gap-2">
        <button
          @click="handleAddFriend"
          :disabled="actionLoading"
          class="flex items-center px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <Icon name="heroicons:user-plus" class="w-4 h-4 mr-2" />
          Accepter l'invitation
        </button>
        <span class="flex items-center px-3 py-2 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg">
          <Icon name="heroicons:envelope" class="w-4 h-4 mr-2" />
          Vous invite
        </span>
      </div>

      <!-- Not friends -->
      <div v-else class="flex gap-2">
        <button
          @click="handleAddFriend"
          :disabled="actionLoading"
          class="flex items-center px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <Icon name="heroicons:user-plus" class="w-4 h-4 mr-2" />
          Ajouter comme ami
        </button>
      </div>
    </template>

    <!-- Additional Actions -->
    <button
      class="flex items-center px-4 py-2 text-sm bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
    >
      <Icon name="heroicons:envelope" class="w-4 h-4 mr-2" />
      Message
    </button>

    <!-- Success/Error Messages -->
    <Transition name="fade">
      <div v-if="successMessage" class="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
        {{ successMessage }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
interface Props {
  targetUserId: number;
  targetUsername: string;
}

const props = defineProps<Props>();

// Composables
const { status, loading, error, addFriend, removeFriend, refresh } = useFriendship(props.targetUserId);

// State
const actionLoading = ref(false);
const successMessage = ref('');

// Methods
const handleAddFriend = async () => {
  actionLoading.value = true;
  
  try {
    const result = await addFriend(props.targetUserId);
    successMessage.value = result.isMutual 
      ? `Vous êtes maintenant amis mutuels avec ${props.targetUsername}!`
      : `Demande d'amitié envoyée à ${props.targetUsername}`;
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);
    
  } catch (error: any) {
    console.error('Failed to add friend:', error);
  } finally {
    actionLoading.value = false;
  }
};

const handleRemoveFriend = async () => {
  actionLoading.value = true;
  
  try {
    await removeFriend(props.targetUserId);
    successMessage.value = `${props.targetUsername} retiré de vos amis`;
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);
    
  } catch (error: any) {
    console.error('Failed to remove friend:', error);
  } finally {
    actionLoading.value = false;
  }
};
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

### Step 7: Create User Friends Component

**File: `components/user/UserFriends.vue`**

```vue
<template>
  <div class="space-y-6">
    <!-- Friends Statistics -->
    <div v-if="friendsData?.stats" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ friendsData.stats.totalFriends }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Total amis
        </div>
      </div>
      <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-green-600 dark:text-green-400">
          {{ friendsData.stats.mutualFriends }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Amis mutuels
        </div>
      </div>
      <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-center">
        <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {{ friendsData.stats.recentlyActive }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Actifs récemment
        </div>
      </div>
    </div>

    <!-- Mutual Friends Section -->
    <div v-if="showMutualFriends && mutualFriends?.length" class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
        <Icon name="heroicons:users" class="w-5 h-5 mr-2" />
        Amis en commun ({{ mutualFriends.length }})
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="friend in mutualFriends.slice(0, 6)"
          :key="friend.id"
          class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg"
        >
          <div class="flex items-center space-x-3">
            <img
              :src="friend.avatar || '/img/noavatar.png'"
              :alt="friend.realName"
              class="w-10 h-10 rounded-full object-cover"
            />
            <div class="flex-1 min-w-0">
              <NuxtLink
                :to="`/user/${friend.realName}`"
                class="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate block"
              >
                {{ friend.realName }}
              </NuxtLink>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ friend.lastLoginFormatted }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
      <span class="ml-3 text-gray-600 dark:text-gray-300">Chargement des amis...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-8">
      <Icon name="heroicons:exclamation-triangle" class="mx-auto h-12 w-12 text-red-400 mb-4" />
      <p class="text-red-600 dark:text-red-400">{{ error }}</p>
      <button @click="loadFriends" class="mt-4 btn-primary">
        Réessayer
      </button>
    </div>

    <!-- Friends List -->
    <div v-else-if="friendsData?.friends.length" class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
        <Icon name="heroicons:user-group" class="w-5 h-5 mr-2" />
        Tous les amis
      </h3>
      
      <!-- Search/Filter -->
      <div class="flex items-center space-x-4">
        <div class="flex-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Rechercher dans les amis..."
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          v-model="sortBy"
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="name">Nom</option>
          <option value="recent">Récemment actif</option>
          <option value="mutual">Amis mutuels</option>
        </select>
      </div>

      <!-- Friends Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="friend in filteredFriends"
          :key="friend.id"
          class="bg-white dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow"
        >
          <div class="flex items-center space-x-3">
            <div class="relative">
              <img
                :src="friend.avatar || '/img/noavatar.png'"
                :alt="friend.realName"
                class="w-12 h-12 rounded-full object-cover"
              />
              <!-- Mutual friend indicator -->
              <div
                v-if="friend.isMutual"
                class="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"
                title="Ami mutuel"
              >
                <Icon name="heroicons:heart" class="w-2 h-2 text-white" />
              </div>
            </div>
            
            <div class="flex-1 min-w-0">
              <NuxtLink
                :to="`/user/${friend.realName}`"
                class="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate block"
              >
                {{ friend.realName }}
              </NuxtLink>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Vu {{ friend.lastLoginFormatted }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Load More -->
      <div v-if="friendsData.friends.length > displayLimit" class="text-center">
        <button
          @click="displayLimit += 12"
          class="btn-secondary"
        >
          Voir plus d'amis
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <Icon name="heroicons:users" class="mx-auto h-16 w-16 text-gray-400 mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Aucun ami pour le moment
      </h3>
      <p class="text-gray-500 dark:text-gray-400 mb-6">
        {{ isOwnProfile ? 'Commencez à ajouter des amis!' : 'Cet utilisateur n\'a pas encore d\'amis.' }}
      </p>
      <button
        v-if="isOwnProfile"
        @click="$emit('openSearch')"
        class="btn-primary"
      >
        Rechercher des amis
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  userId: number;
  showMutualFriends?: boolean;
  currentUserId?: number;
}

const props = withDefaults(defineProps<Props>(), {
  showMutualFriends: false
});

// Emits
defineEmits<{
  openSearch: [];
}>();

// Composables
const friendsAPI = useFriendsAPI();

// State
const friendsData = ref<FriendsResponse | null>(null);
const mutualFriends = ref<FriendData[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');
const sortBy = ref('name');
const displayLimit = ref(12);

// Computed
const isOwnProfile = computed(() => {
  return props.currentUserId === props.userId;
});

const filteredFriends = computed(() => {
  if (!friendsData.value?.friends) return [];
  
  let filtered = friendsData.value.friends;
  
  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(friend => 
      friend.realName.toLowerCase().includes(query)
    );
  }
  
  // Apply sorting
  filtered = [...filtered].sort((a, b) => {
    switch (sortBy.value) {
      case 'recent':
        return b.lastLogin - a.lastLogin;
      case 'mutual':
        if (a.isMutual === b.isMutual) return a.realName.localeCompare(b.realName);
        return b.isMutual ? 1 : -1;
      default: // name
        return a.realName.localeCompare(b.realName);
    }
  });
  
  return filtered.slice(0, displayLimit.value);
});

// Methods
const loadFriends = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    friendsData.value = await friendsAPI.getFriends(props.userId);
    
    // Load mutual friends if needed
    if (props.showMutualFriends && props.currentUserId) {
      try {
        mutualFriends.value = await friendsAPI.getMutualFriends(props.userId);
      } catch (err) {
        console.warn('Failed to load mutual friends:', err);
      }
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to load friends';
  } finally {
    loading.value = false;
  }
};

// Load friends on mount
onMounted(loadFriends);
</script>
```

### Step 8: Add Friends Search Component

**File: `components/user/FriendSearch.vue`**

```vue
<template>
  <div class="space-y-4">
    <!-- Search Input -->
    <div class="relative">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Icon name="heroicons:magnifying-glass" class="h-5 w-5 text-gray-400" />
      </div>
      <input
        v-model="searchQuery"
        @input="debouncedSearch"
        type="text"
        placeholder="Rechercher des utilisateurs..."
        class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-gray-700 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    <!-- Search Results -->
    <div v-if="searchQuery.length >= 2" class="space-y-2">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-4">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto"></div>
        <span class="text-sm text-gray-500 dark:text-gray-400 mt-2 block">Recherche...</span>
      </div>

      <!-- Results -->
      <div v-else-if="searchResults.length" class="space-y-2 max-h-96 overflow-y-auto">
        <div
          v-for="user in searchResults"
          :key="user.id"
          class="flex items-center justify-between p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:shadow-sm transition-shadow"
        >
          <div class="flex items-center space-x-3">
            <img
              :src="user.avatar || '/img/noavatar.png'"
              :alt="user.realName"
              class="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <NuxtLink
                :to="`/user/${user.realName}`"
                class="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
              >
                {{ user.realName }}
              </NuxtLink>
              <div class="flex items-center space-x-2 text-sm">
                <span
                  v-if="user.areFriends"
                  class="text-green-600 dark:text-green-400 flex items-center"
                >
                  <Icon name="heroicons:check" class="w-3 h-3 mr-1" />
                  Ami
                </span>
                <span
                  v-else
                  class="text-gray-500 dark:text-gray-400"
                >
                  Pas ami
                </span>
              </div>
            </div>
          </div>

          <!-- Action Button -->
          <button
            v-if="!user.areFriends"
            @click="addFriend(user.id)"
            :disabled="actionLoading[user.id]"
            class="flex items-center px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-colors"
          >
            <div v-if="actionLoading[user.id]" class="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent mr-2"></div>
            <Icon v-else name="heroicons:user-plus" class="w-3 h-3 mr-1" />
            Ajouter
          </button>
        </div>
      </div>

      <!-- No Results -->
      <div v-else-if="searchQuery.length >= 2 && !loading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <Icon name="heroicons:magnifying-glass" class="mx-auto h-12 w-12 mb-2" />
        Aucun utilisateur trouvé pour "{{ searchQuery }}"
      </div>
    </div>

    <!-- Search Hint -->
    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
      <Icon name="heroicons:users" class="mx-auto h-12 w-12 mb-2" />
      Tapez au moins 2 caractères pour rechercher des utilisateurs
    </div>
  </div>
</template>

<script setup lang="ts">
// Composables
const friendsAPI = useFriendsAPI();

// State
const searchQuery = ref('');
const searchResults = ref<SearchResult[]>([]);
const loading = ref(false);
const actionLoading = ref<Record<number, boolean>>({});

// Debounced search
const debouncedSearch = debounce(async () => {
  if (searchQuery.value.length < 2) {
    searchResults.value = [];
    return;
  }

  loading.value = true;
  
  try {
    searchResults.value = await friendsAPI.searchUsers(searchQuery.value, 10);
  } catch (error) {
    console.error('Search failed:', error);
    searchResults.value = [];
  } finally {
    loading.value = false;
  }
}, 300);

// Add friend
const addFriend = async (userId: number) => {
  actionLoading.value[userId] = true;
  
  try {
    await friendsAPI.addFriend(userId);
    
    // Update the search result to reflect the new friendship
    const userIndex = searchResults.value.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      searchResults.value[userIndex].areFriends = true;
    }
  } catch (error) {
    console.error('Failed to add friend:', error);
  } finally {
    actionLoading.value[userId] = false;
  }
};

// Utility function
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
</script>
```

## 🎯 Integration Instructions

### 1. Add to Main App Module
Update your main app module to include the friends routes:

**File: `app.vue`** (or main layout)
```vue
<template>
  <div>
    <!-- Your existing layout -->
    <NuxtPage />
  </div>
</template>
```

### 2. Update Navigation
Add links to user profiles in your navigation:

```vue
<!-- In your navigation component -->
<NuxtLink :to="`/user/${authStore.user?.memberName}`" class="nav-link">
  Mon Profil
</NuxtLink>
```

### 3. Environment Configuration
Update your `.env` file:

```env
# API Configuration
NUXT_PUBLIC_API_URL=http://localhost:3000/api
```

### 4. Update Runtime Config
**File: `nuxt.config.ts`**

```typescript
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || 'http://localhost:3000/api'
    }
  }
  // ... rest of your config
})
```

## 🔗 API Endpoints Usage

### Frontend API Calls Examples

```typescript
// Get current user's friends
const { friends, stats } = await $fetch('/api/friends', {
  headers: { Authorization: `Bearer ${token}` }
});

// Add friend
await $fetch('/api/friends/add/123', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }
});

// Search users
const results = await $fetch('/api/friends/search?q=john&limit=5', {
  headers: { Authorization: `Bearer ${token}` }
});
```

## 📱 Responsive Design

The components are built with Tailwind CSS and are fully responsive:
- Mobile-first approach
- Collapsible sections on small screens
- Touch-friendly interaction areas
- Optimized for both light and dark themes

## 🎨 Customization

### Styling
All components use Tailwind CSS classes and can be easily customized by modifying the class names.

### Icons
The implementation uses Heroicons via `@nuxt/icon`. You can replace with your preferred icon system.

### Themes
Full support for light/dark themes using Tailwind's dark mode classes.

This implementation provides a complete, production-ready friends management system for your frontend that integrates seamlessly with your existing backend API.