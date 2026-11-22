# Proposal

## Why

Readers have no easy way to pass a post on. They have to copy the address bar themselves. And when they do paste a link into Facebook, X or WhatsApp, the result looks poor. The site sends no Open Graph or Twitter Card metadata, posts pass no description to the page head, and Astro's `site` is still the template's `https://example.com`, so any absolute URL the site produces points at the wrong domain. A share button only helps if the shared link turns into a proper preview card, so both parts belong in one change.

## What Changes

- Add share buttons to every post (`/blog/*` and `/viet/*`), next to both like buttons (top and bottom). The buttons are Facebook, X, WhatsApp and Copy link, plus a native **Share…** button that opens the device's share sheet wherever the browser supports it.
- The buttons are plain links to each platform's public share URL. No third-party scripts, SDKs or tracking pixels load on any page.
- Zalo on `/viet/` posts is reached through the native share sheet, which lists Zalo when it is installed. No Zalo SDK and no Zalo Official Account. On desktop browsers without a share sheet, Copy link is the fallback.
- Add preview-card metadata to every page: Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `og:locale`), `twitter:card`, and a canonical link.
- Post preview images:
  - **Contentful posts:** the first image embedded in the post body, cropped to 1200×630 through Contentful's image service.
  - **`/viet/` posts:** the frontmatter `heroImage`.
  - **Fallback:** a new site-wide default card (1200×630) for posts without an image, and for non-post pages.
- Post descriptions:
  - **Contentful posts:** the opening of the post body as plain text, up to about 160 characters.
  - **`/viet/` posts:** the existing frontmatter `description`.
  - **Fallback:** the site description.
- Set Astro `site` to `https://tedvu.com`. This also corrects the URLs in the sitemap and RSS feed, which currently point at `example.com`.
- Create the default share image (a plain branded card with the site name) as part of this change.

## Capabilities

### New Capabilities
- `post-sharing`: the share controls on post pages (which platforms, where they appear, what URL and text they share), copy-link feedback, the native share sheet, and the no-third-party-scripts constraint.
- `link-previews`: the metadata every page sends to link crawlers, including canonical URL, title, description and image selection with fallbacks, so shared links render as preview cards.

### Modified Capabilities
<!-- None: no existing specs in openspec/specs/. -->

## Impact

- **Config:** `astro.config.mjs` (`site`).
- **Head:** `src/components/BaseHead.astro` (Open Graph, Twitter and canonical tags; uses the `image` prop it already declares).
- **Layout:** `src/layouts/BlogPost.astro` (mounts the share buttons beside both `LikeButton`s, and passes description, image and locale to `BaseHead`).
- **Post pages:** `src/pages/blog/[post].astro` (derives the description and preview image from the Contentful body). `src/pages/viet/[post].astro` already passes frontmatter `description` and `heroImage`.
- **New component:** `src/components/ShareButtons.astro`.
- **New assets:** `public/og-default.jpg`, plus its editable source file.
- **Dependencies:** none added.
- **Content model:** no Contentful changes.
