<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

// Maps post key (e.g. "blog/my-slug") to its title.
const props = withDefaults(
  defineProps<{ titles: Record<string, string>; limit?: number }>(),
  { limit: 5 },
);

const top = ref<{ postKey: string; count: number }[] | null>(null);
const failed = ref(false);

const posts = computed(() =>
  (top.value ?? [])
    .filter((p) => p.count > 0 && props.titles[p.postKey])
    .slice(0, props.limit)
    .map((p) => ({ ...p, title: props.titles[p.postKey] })),
);

onMounted(async () => {
  try {
    const res = await fetch("/api/likes/top");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    top.value = (await res.json()).top;
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <section v-if="!failed" class="top-liked">
    <h2>Most liked posts</h2>
    <p v-if="top === null" class="muted">Loading…</p>
    <p v-else-if="posts.length === 0" class="muted">No likes yet — be the first!</p>
    <ol v-else>
      <li v-for="post in posts" :key="post.postKey">
        <a :href="`/${post.postKey}/`">{{ post.title }}</a>
        <span class="count" :aria-label="`${post.count} likes`">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"
            />
          </svg>
          {{ post.count }}
        </span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.top-liked {
  margin-top: 2.5em;
}
ol {
  padding-left: 1.5em;
}
li {
  margin-bottom: 0.5em;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  margin-left: 0.6em;
  font-size: 0.9em;
  font-variant-numeric: tabular-nums;
  color: #e0245e;
}
svg {
  fill: currentColor;
}
.muted {
  color: rgba(34, 41, 57, 0.75);
}
</style>
