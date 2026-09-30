<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

// Astro passes transition:persist through as an attribute. Letting it fall
// through to the <span> gives the page two elements with the same persist id,
// and Astro then swaps the wrong one out when navigating.
defineOptions({ inheritAttrs: false });

// Must stay under ACTIVE_WINDOW_MS in src/lib/presence.ts (about half of it).
const HEARTBEAT_MS = 30_000;
const STORAGE_KEY = "visitorId";

const count = ref<number | null>(null);
let visitorId = "";
let timer: ReturnType<typeof setInterval> | undefined;

// One id per browser, so several open tabs count as one reader.
function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

async function beat() {
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId }),
    });
    if (res.ok) count.value = (await res.json()).count;
  } catch {}
}

function start() {
  stop();
  beat();
  timer = setInterval(beat, HEARTBEAT_MS);
}

function stop() {
  clearInterval(timer);
  timer = undefined;
}

// Only readers with the page in front of them count: pause while hidden.
function onVisibilityChange() {
  if (document.visibilityState === "visible") start();
  else stop();
}

function onPageHide() {
  navigator.sendBeacon("/api/presence/leave", JSON.stringify({ visitorId }));
}

onMounted(() => {
  // Bots driving a browser shouldn't count as readers.
  if (navigator.webdriver) return;
  visitorId = getVisitorId();
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  if (document.visibilityState === "visible") start();
});

onUnmounted(() => {
  stop();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pagehide", onPageHide);
});
</script>

<template>
  <span v-if="count !== null" class="active-readers">
    Active readers: {{ count }}
  </span>
</template>

<style scoped>
.active-readers {
  font-size: 0.85em;
  font-style: italic;
  color: rgba(34, 41, 57, 0.75);
}
</style>
