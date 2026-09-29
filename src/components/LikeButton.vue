<script setup lang="ts">
import { onMounted, ref } from "vue";

const props = defineProps<{ postKey: string }>();

const storageKey = `liked:${props.postKey}`;
const endpoint = `/api/likes/${props.postKey}`;
const count = ref<number | null>(null);
const liked = ref(false);
const pending = ref(false);

onMounted(async () => {
  try {
    liked.value = localStorage.getItem(storageKey) === "1";
  } catch {}
  try {
    const res = await fetch(endpoint);
    if (res.ok) count.value = (await res.json()).count;
  } catch {}
});

async function like() {
  if (liked.value || pending.value) return;
  const previous = count.value ?? 0;
  liked.value = true;
  pending.value = true;
  count.value = previous + 1;
  try {
    const res = await fetch(endpoint, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    count.value = (await res.json()).count;
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
  } catch {
    liked.value = false;
    count.value = previous;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="like">
    <button
      type="button"
      :class="{ liked }"
      :disabled="liked || pending"
      :aria-pressed="liked"
      :aria-label="liked ? 'You liked this post' : 'Like this post'"
      @click="like"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"
        />
      </svg>
      <span class="count">{{ count ?? "–" }}</span>
    </button>
    <span class="prompt">{{
      liked ? "Thanks for reading!" : "Enjoyed this post?"
    }}</span>
  </div>
</template>

<style scoped>
.like {
  display: flex;
  align-items: center;
  gap: 1em;
  margin-top: 2.5em;
  padding-top: 1.5em;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}
button {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.55em 1.2em;
  font: inherit;
  font-weight: 600;
  color: rgb(34, 41, 57);
  background: #fff;
  border: none;
  border-radius: 999px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition:
    transform 0.15s,
    color 0.15s;
}
button:hover:not(:disabled) {
  transform: translateY(-1px);
  color: #e0245e;
}
button:active:not(:disabled) {
  transform: scale(0.96);
}
button:disabled {
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
.count {
  min-width: 1ch;
  font-variant-numeric: tabular-nums;
}
.liked {
  color: #e0245e;
}
.liked svg {
  fill: currentColor;
  animation: pop 0.3s ease-out;
}
.prompt {
  font-size: 0.95em;
  color: rgba(34, 41, 57, 0.75);
}
@keyframes pop {
  50% {
    transform: scale(1.3);
  }
}
@media (prefers-reduced-motion: reduce) {
  button,
  .liked svg {
    transition: none;
    animation: none;
  }
}
</style>
