// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import vue from "@astrojs/vue";
import netlify from "@astrojs/netlify";

// The Netlify adapter's dev emulation starts a Deno edge-functions server that
// fails locally; the adapter is only needed to build for deployment.
const isDev = process.argv.includes("dev");

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [mdx(), sitemap(), vue()],
  output: "static",
  adapter: isDev ? undefined : netlify(),
  prefetch: true,
});
