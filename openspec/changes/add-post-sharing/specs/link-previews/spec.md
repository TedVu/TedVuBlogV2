# Spec Delta

## Purpose

Makes every page describe itself to link crawlers (Facebook, X, WhatsApp, Zalo and others), so a shared link shows a preview card with the right title, summary, image and address.

## ADDED Requirements

### Requirement: Canonical site URL
All absolute URLs the site produces SHALL use the production origin `https://tedvu.com`. This covers preview metadata, share links, the sitemap and the RSS feed. Each page SHALL have exactly one canonical URL: the production origin plus the page path, with the site's trailing-slash form and without any query string or fragment.

#### Scenario: Canonical URL of a post
- **WHEN** the built page for `/blog/my-post/` is inspected
- **THEN** its canonical link and `og:url` are both `https://tedvu.com/blog/my-post/`

#### Scenario: Query strings are ignored
- **WHEN** a reader opens `/blog/my-post/?utm_source=x` and shares it
- **THEN** the shared URL is `https://tedvu.com/blog/my-post/`

#### Scenario: No placeholder domain remains
- **WHEN** the built site (pages, sitemap and RSS feed) is searched for `example.com`
- **THEN** there are no matches

### Requirement: Preview metadata on every page
Every page SHALL include in its head: `og:title`, `og:description`, `og:image` (an absolute URL), `og:image:alt`, `og:url`, `og:type`, `og:site_name`, `og:locale`, `twitter:card` set to `summary_large_image`, and a canonical link. `og:type` SHALL be `article` on post pages and `website` on other pages. `og:site_name` SHALL be the site title. `og:locale` SHALL be `vi_VN` on `/viet/` posts and `en_US` elsewhere.

#### Scenario: Post page
- **WHEN** the built HTML of any `/blog/` or `/viet/` post is inspected
- **THEN** every tag listed above is present exactly once, `og:type` is `article`, and `og:image` starts with `https://`

#### Scenario: Non-post page
- **WHEN** the built HTML of the home page, `/about` or a section index is inspected
- **THEN** every tag listed above is present, `og:type` is `website`, and the title, description and image use the page's own values or the site defaults

#### Scenario: Vietnamese post locale
- **WHEN** the built HTML of a `/viet/` post is inspected
- **THEN** `og:locale` is `vi_VN`

### Requirement: Preview title
`og:title` SHALL be the post title on post pages, and the page's existing `<title>` everywhere else.

#### Scenario: Post title
- **WHEN** a post titled "Learning Astro" is shared
- **THEN** the preview card's title is "Learning Astro"

### Requirement: Preview description
The page description (the `description` meta tag and `og:description`) SHALL be chosen in this order:

- Contentful posts: the post body as plain text, with markup removed and whitespace collapsed, cut at a word boundary to at most 160 characters, with an ellipsis when cut.
- `/viet/` posts: the frontmatter `description`.
- Any page with no usable description: the site description.

#### Scenario: Long Contentful post
- **WHEN** a Contentful post's body text is longer than 160 characters
- **THEN** the description is its opening text, at most 160 characters, ending at a whole word followed by "…"

#### Scenario: Short Contentful post
- **WHEN** a Contentful post's body text is 160 characters or fewer
- **THEN** the description is the full body text with no ellipsis

#### Scenario: Body with no text
- **WHEN** a Contentful post's body contains only images, or is empty
- **THEN** the description is the site description

#### Scenario: Vietnamese post
- **WHEN** a `/viet/` post has frontmatter `description: "Ghi chép về..."`
- **THEN** the description is "Ghi chép về..."

### Requirement: Preview image
`og:image` SHALL be chosen in this order:

1. Contentful posts: the first raster image (JPEG, PNG, WebP or GIF) embedded in the post body, served from Contentful's image service as a 1200×630 JPEG cropped to fill the frame.
2. `/viet/` posts: the frontmatter `heroImage`, as an absolute URL.
3. Otherwise: the site default share image, a 1200×630 JPEG of at most 300 KB served from the site.

When the image size is known (cases 1 and 3), the page SHALL also state `og:image:width` 1200 and `og:image:height` 630. `og:image:alt` SHALL describe the image: the asset's description or title for Contentful images, the post title for a `heroImage`, and the site title for the default image.

#### Scenario: Contentful post with images
- **WHEN** a Contentful post embeds a PNG and later a JPEG
- **THEN** `og:image` is the PNG's Contentful URL with `https:` and 1200×630 JPEG fill-crop parameters, and width 1200 and height 630 are stated

#### Scenario: Contentful post whose only image is unsupported
- **WHEN** a Contentful post's only embedded asset is an SVG or a non-image file
- **THEN** `og:image` is the site default share image

#### Scenario: Contentful post without images
- **WHEN** a Contentful post embeds no assets
- **THEN** `og:image` is `https://tedvu.com/og-default.jpg`

#### Scenario: Vietnamese post with a hero image
- **WHEN** a `/viet/` post has `heroImage: "/images/hoi-an.jpg"`
- **THEN** `og:image` is `https://tedvu.com/images/hoi-an.jpg`

#### Scenario: Default image size
- **WHEN** the site default share image is downloaded
- **THEN** it is a 1200×630 JPEG no larger than 300 KB
