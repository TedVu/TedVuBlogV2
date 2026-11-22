# Design

## Context

See proposal.md for the motivation. The current state that shapes the approach:

- **Static Astro 5 site on Netlify** (`output: "static"`), with `ClientRouter` for client-side navigation. Interactive pieces are either Vue islands (`LikeButton.vue`) or Astro components with a bundled script (`ThemeToggle.astro`).
- **Two post sources share one layout.** `/blog/*` posts come from Contentful at build time. `src/pages/blog/[post].astro` renders the rich-text body to HTML, and already has a `BLOCKS.EMBEDDED_ASSET` renderer that sees every embedded image. `/viet/*` posts come from a local content collection whose schema already has `description` and an optional `heroImage`, and it spreads `post.data` into the layout. Both use `src/layouts/BlogPost.astro`, which computes `postKey` and `isPost` and mounts `LikeButton` at the top (centered under the title) and at the bottom.
- **`BaseHead.astro`** is the only place pages set head metadata. It declares an `image` prop it never uses, and receives `description={undefined}` from every post.
- **`astro.config.mjs`** has `site: "https://example.com"`, so `Astro.site`, the sitemap and RSS all produce wrong absolute URLs today.
- **No test framework.** As in `add-dark-mode`, verification uses `npm run build`, inspecting `dist/`, and the browser.
- **Theme tokens** live in `global.css`. `LikeButton.vue` still hardcodes light colors (`#fff` background), so in the dark theme it is a white pill.

## Goals / Non-Goals

**Goals:**
- Compute every share and preview value at build time, so the head and the share links are plain HTML that crawlers and no-JS readers get as-is.
- Keep JavaScript to two progressive enhancements: copy link and the native share sheet.
- Keep one source of truth for "this page's canonical URL, title, description and image", used by both the head tags and the share links.

**Non-Goals:**
- Share counts or click analytics (no Redis, no API route).
- A Contentful cover image or summary field. It can be added later as a higher-priority source without changing this design.
- Generating a different image for each post, such as cards with the title drawn on them.
- Fixing `<html lang="en">` on `/viet/` pages, and tokenizing `LikeButton.vue`'s colors. Both are real issues but separate changes.
- A Zalo-branded button or the Zalo SDK.
- Share controls on non-post pages.

## Decisions

### 1. Share-intent links, not platform SDKs

Each platform button is an `<a href target="_blank" rel="noopener noreferrer">` to:

| Platform | URL |
|---|---|
| Facebook | `https://www.facebook.com/sharer/sharer.php?u={url}` |
| X | `https://x.com/intent/post?url={url}&text={title}` |
| WhatsApp | `https://wa.me/?text={title}%20{url}` |

Each value is built with `encodeURIComponent`.

- **Why:** the links work without JS and load nothing from third parties until clicked, which satisfies the no-third-party-scripts requirement. They also leave nothing to keep up to date. Facebook's sharer takes only the URL, and builds the card from our Open Graph tags.
- **Alternatives:**
  - Platform SDK widgets: they track readers, load heavily, and Facebook's needs an app ID.
  - Popup windows via `window.open` with a size: a small UX gain, but it adds JS and is blocked on some mobile browsers. New tabs are good enough.
  - `twitter.com/intent/tweet`: still works, but `x.com/intent/post` is the current form.

### 2. `ShareButtons.astro` with one delegated script

This is a new Astro component, not a Vue island, following the `ThemeToggle.astro` pattern. The links are static HTML rendered at build time. Its props are `url`, `title` and `position: "top" | "bottom"`.

The component has two `<button type="button">`s, Copy link (`data-share-copy`) and **Share…** (`data-share-native`). Both carry `data-url` and `data-title`. **Share…** renders with the `hidden` attribute.

There is one bundled `<script>`. Astro bundles and runs it once per session even with `ClientRouter`. It:
- Registers a single `document` click listener that handles `[data-share-copy]` and `[data-share-native]` by delegation. Because it reads `data-url` from the clicked button, it is correct after every swap and for both instances on a page.
- On `astro:page-load`, which fires on the first load and after every swap, removes `hidden` from `[data-share-native]` buttons when `"share" in navigator`.

Other behavior:
- **Copy link:** `navigator.clipboard.writeText(url)`. On success, the button text changes to "Copied" for 2 seconds, and a visually hidden `aria-live="polite"` region inside the component announces it. If the API is missing or rejects (an insecure context or a denied permission), it falls back to `window.prompt("Copy this link:", url)`, which shows the URL already selected.
- **Share…:** `navigator.share({ title, url })`. An `AbortError` (the reader dismissed the sheet) is ignored silently. Any other error falls back to the copy behavior.

- **Why not Vue:** none of the controls have reactive state worth hydrating, and the links must exist without JS. A Vue island would hydrate two instances per page for the sake of two click handlers.
- **Why delegation:** per-element listeners would need re-binding on every `astro:page-load`, and would double-bind if the script ran again. One document listener avoids both.

### 3. Placement: a shared actions row in `BlogPost.astro`

`BlogPost.astro` wraps each `LikeButton` together with a `ShareButtons` in a `.post-actions` flex row with `flex-wrap: wrap` and a gap.

- **Top row:** centered under the title, as the like button is today. Icon-only pills.
- **Bottom row:** a border-top separator, like button and prompt on the left, share pills after them, wrapping to a second line on narrow screens.

`LikeButton`'s own `.like.top` and `.like.bottom` margins and border move to the row, so the like button itself is not restyled. That is a small edit to `LikeButton.vue`'s scoped styles. The row only renders when `isPost`.

The pill shape, radius and shadow copy `LikeButton`'s button (`border-radius: 999px`, `var(--shadow)`). Colors use theme tokens (`--color-surface`, `--color-text`, `--accent` for focus and hover), so the share pills follow the theme. In the dark theme the like pill next to them stays white until `LikeButton` is tokenized (a non-goal, see Risks).

The icons are inline SVGs: Facebook "f", X logo, WhatsApp, a link icon and a share icon, all in `currentColor`. Each control has an `aria-label` ("Share on Facebook", "Share on X", "Share on WhatsApp", "Copy link", "Share via…") and a `title` tooltip.

### 4. One preview "page meta" object, built by each page and passed down

`BaseHead.astro` takes `title`, `description?`, `image?` (`{ url, alt, width?, height? }`), `type?` (`"website" | "article"`, default `"website"`) and `locale?` (default `"en_US"`). It fills the gaps with `SITE_DESCRIPTION` and the default image, and emits:

- `<link rel="canonical">`
- `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`
- `og:image`, `og:image:alt`, plus `og:image:width` and `og:image:height` when known
- `twitter:card=summary_large_image`

The canonical URL is `new URL(Astro.url.pathname, Astro.site).href`, which drops the query string by construction. `BaseHead` exposes no way to override it, so the canonical URL is always the page's own path.

`BlogPost.astro` computes the same canonical URL once and passes it to `ShareButtons`. The share links and `og:url` therefore cannot disagree. It also forwards `description`, `image`, `type: "article"` and `locale` (from the section: `vi_VN` for `viet/…`) to `BaseHead`.

- **Why:** the page files already know their content. The head stays dumb, and the defaults live in one place.
- **Alternative:** have `BaseHead` read the post from the URL. That would couple the head to both content sources.

### 5. Contentful description: walk the rich-text tree, no new dependency

A small helper in `src/lib/contentful.ts`:

- `plainTextExcerpt(document, max = 160)` recursively concatenates `text` nodes, adds a space at block boundaries, and collapses whitespace.
- If the text is longer than `max`, it cuts at the last space at or before `max - 1` and appends "…". This also covers a first word longer than 160 characters, which is cut hard.
- If the result is empty, it returns `undefined`, so `BaseHead` falls back to `SITE_DESCRIPTION`.

`[post].astro` calls it in `getStaticPaths` and adds `description` to the props.

- **Alternative:** `@contentful/rich-text-plain-text-renderer` does the text walk, but it is a new dependency for a few lines, and still needs the truncation.

### 6. Contentful preview image: first raster asset, Images API crop

`getStaticPaths` already loops over embedded assets in its `renderNode` callback. That callback runs during `documentToHtmlString` and carries render concerns, so the image selection is a separate, pure helper instead: `firstImageAsset(document)` walks the tree in document order and returns the first `embedded-asset-block` whose `file.contentType` is `image/jpeg`, `image/png`, `image/webp` or `image/gif`. The preview image is then:

```
https:{file.url}?w=1200&h=630&fit=fill&fm=jpg&q=80
alt = asset description || asset title || post title
```

- `fit=fill` resizes and crops to exactly 1200×630, from the center by default. `fm=jpg` makes PNG, WebP and GIF previews into single-frame JPEGs, which every crawler accepts.
- SVGs are skipped because Contentful's image service doesn't transform them, and several crawlers reject SVG previews. A post whose only images are SVGs falls back to the default image.
- `/viet/` posts: when `heroImage` is set, `BlogPost.astro` passes `{ url: new URL(heroImage, Astro.site).href, alt: title }` with no width or height, because the size isn't known at build time. Crawlers fetch it and work out the size themselves.

### 7. Default share image: an HTML source rendered once to JPEG

The source is `scripts/og-default.html`: a fixed 1200×630 page with the light-theme background `rgb(189 221 252)` and heading color, the site title "Ted Vu Blog" set in Montserrat, a short tagline, and `tedvu.com`. It is rendered once with headless Chrome:

```
chrome --headless --screenshot=public/og-default.png --window-size=1200,630 scripts/og-default.html
```

The PNG is then converted to JPEG (≤ 300 KB) with the `sharp` copy already in `node_modules` (installed as an Astro dependency), and the PNG is deleted. Both the source and `public/og-default.jpg` are committed. The exact commands go in a comment at the top of the HTML, so the image can be regenerated after a rebrand.

- **Why:** text rendered by Chrome uses the real Montserrat font (the HTML loads it from `node_modules/@fontsource-variable/montserrat`). Rasterizing an SVG with sharp's librsvg would fall back to a system font.
- **Alternative:** a build-time generator (satori or `@vercel/og`). It is overkill for one static image, and adds dependencies.
- The light palette is used because the preview card appears inside other apps, whose theme we don't control.

### 8. `site: "https://tedvu.com"`

This is a one-line config change. It also fixes `@astrojs/sitemap` and `rss.xml.js` (`context.site`) as a side effect. Trailing-slash behavior is unchanged: Astro's default `directory` build format produces `/blog/<slug>/`, which matches the existing `postKey` logic.

## Risks / Trade-offs

- [Crawlers can't reach `localhost`, so preview cards can't be checked end to end before deploy] → Verify the tags in the built `dist/` HTML locally. After deploy, check one blog post and the home page with the Facebook Sharing Debugger (which also clears Facebook's cache) and opengraph.xyz, and by pasting a link into WhatsApp.
- [Platforms cache previews: posts already shared keep their old or empty card] → The Facebook Sharing Debugger's "Scrape Again" refreshes it. X and WhatsApp refresh within days. This is acceptable.
- [Platforms change their share URLs] → All three are long-standing public endpoints. They live in one component, so a change is one edit.
- [Center crop cuts off the subject of tall or off-center images] → Accepted for v1. A later Contentful cover image field can let the author choose a better image. Contentful's `f=faces` focus is a possible tweak.
- [The first embedded image may be a diagram or screenshot, not a good cover] → Accepted. The cover image field in Non-Goals is the fix.
- [`window.prompt` fallback looks dated] → It only appears when the clipboard API is unavailable, which is rare on the HTTPS production site.
- [In the dark theme the white like pill sits beside theme-colored share pills] → An existing `LikeButton` issue. It is called out as a follow-up rather than widening this change.
- [Desktop readers of `/viet/` posts get no Zalo icon] → The agreed trade-off (Zalo option 1). Copy link covers pasting into Zalo desktop.
- [Changing `site` changes sitemap and RSS URLs] → They currently point at `example.com` and are already wrong, so this is a fix, not a regression.

## Migration Plan

There is no data migration. Deploy as normal through Netlify. Rollback is a revert of the change. Old share links keep working, because post URLs are unchanged.
