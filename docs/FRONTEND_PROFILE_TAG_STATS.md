# Profile Genres/Themes Stats (Frontend v2)

This adds collection-based Genres/Themes stats for a user profile, computed from the user's collection (anime + manga), with weighting by the user's rating (evaluation) for each item.

Data is exposed on existing profile stats endpoints:

- Authenticated: `GET /users/:id/stats`
- Public: `GET /users/public/:pseudo/stats`

Both responses now include a `collectionTagStats` block:

```
collectionTagStats: {
  combinedTop: Array<{ id, name, niceUrl, category, count, sumRating, avgRating }>,
  animeTop: Array<{ id, name, niceUrl, category, count, sumRating, avgRating }>,
  mangaTop: Array<{ id, name, niceUrl, category, count, sumRating, avgRating }>
}
```

- `category`: 'Genre' or 'Thème'
- `count`: number of collection items tagged with this tag
- `sumRating`: total of the user's ratings (0–5) across those items (useful as a weight)
- `avgRating`: average rating for the tag (ignores zero values)

## Frontend v2 (Nuxt) Example

Example in a profile page component to fetch and render the top combined tags:

```ts
// composables/useUserCollectionTags.ts
import { useNuxtApp } from '#app';

export async function useUserCollectionTags(userId: number) {
  const { $fetch } = useNuxtApp();
  const data = await $fetch(`/api/users/${userId}/stats`); // proxy to backend
  return data.collectionTagStats;
}
```

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUserCollectionTags } from '@/composables/useUserCollectionTags';

const props = defineProps<{ userId: number }>();
const tags = ref<any>(null);

onMounted(async () => {
  tags.value = await useUserCollectionTags(props.userId);
});

function percentOfMax(v: number, max: number) {
  return max ? Math.round((v / max) * 100) : 0;
}
</script>

<template>
  <section v-if="tags">
    <h3>Genres & Thèmes (Collection)</h3>
    <div class="tags-list">
      <div
        v-for="t in tags.combinedTop"
        :key="t.id"
        class="tag-row"
      >
        <span class="name">{{ t.name }}</span>
        <span class="meta">{{ t.category }} · {{ t.count }} items</span>
        <div class="bar">
          <div
            class="fill"
            :style="{ width: percentOfMax(t.sumRating, tags.combinedTop[0]?.sumRating) + '%' }"
            :title="`Weighted score: ${t.sumRating} | Avg: ${t.avgRating ?? '-'} `"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tags-list { display: grid; gap: 8px; }
.tag-row { display: grid; gap: 4px; }
.name { font-weight: 600; }
.meta { font-size: 12px; color: #666; }
.bar { width: 100%; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: #7c3aed; }
</style>
```

You can switch to `animeTop` or `mangaTop` for per-media views, or filter by `category` if you want to show Genres and Themes in separate lists.

## Notes

- Public profile uses only items where `is_public = true`.
- Weight uses `evaluation` from collection rows (0–5). Zero is excluded from `avgRating` but included in `sumRating`.
- Ordering favors higher `sumRating`, with `count` as a tie-breaker.

