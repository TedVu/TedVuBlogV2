# Spec Delta

## Purpose

Lets readers share a blog post to Facebook, X, WhatsApp, or any app on their device, straight from the post page, without the site loading third-party scripts.

## ADDED Requirements

### Requirement: Share controls on post pages
Every post page (`/blog/<slug>/` and `/viet/<slug>/`) SHALL show a set of share controls in two places: next to the like button below the post title, and next to the like button at the end of the post. Pages that are not posts (home, blog and Viet indexes, `/about`, `/top-100`) SHALL NOT show share controls.

#### Scenario: Controls appear at the top and bottom of a post
- **WHEN** a reader opens any `/blog/<slug>/` or `/viet/<slug>/` page
- **THEN** share controls appear beside the top like button and beside the bottom like button

#### Scenario: Controls are absent from non-post pages
- **WHEN** a reader opens the home page, `/blog/`, `/viet/`, `/about` or `/top-100`
- **THEN** no share controls are shown

#### Scenario: Controls survive client-side navigation
- **WHEN** a reader moves from one post to another using in-site links
- **THEN** the share controls on the new post share the new post, not the previous one

### Requirement: Platform share links
The share controls SHALL include Facebook, X and WhatsApp links. Each link SHALL use the platform's public share URL with the post's canonical URL (see `link-previews`), and SHALL open in a new tab without giving the opened page access to the blog page. The X and WhatsApp links SHALL also include the post title as the share text. All values SHALL be URL-encoded.

#### Scenario: Facebook link
- **WHEN** a reader activates the Facebook control on `https://tedvu.com/blog/my-post/`
- **THEN** a new tab opens `https://www.facebook.com/sharer/sharer.php` with `u` set to `https://tedvu.com/blog/my-post/`

#### Scenario: X link
- **WHEN** a reader activates the X control on a post titled "My Post"
- **THEN** a new tab opens `https://x.com/intent/post` with `url` set to the post's canonical URL and `text` set to "My Post"

#### Scenario: WhatsApp link
- **WHEN** a reader activates the WhatsApp control on a post
- **THEN** a new tab opens `https://wa.me/` with `text` set to the post title, a space, and the post's canonical URL

#### Scenario: Special characters in the title
- **WHEN** the post title contains characters such as `&`, `?`, `#` or Vietnamese diacritics
- **THEN** the share URL is correctly encoded, and the platform receives the full title and URL unchanged

#### Scenario: Links work without JavaScript
- **WHEN** JavaScript is disabled or has not loaded yet
- **THEN** the Facebook, X and WhatsApp controls still work as ordinary links

### Requirement: Copy link
The share controls SHALL include a Copy link control that puts the post's canonical URL on the clipboard and confirms the copy to the reader, including to screen readers. If the browser blocks clipboard access, the reader SHALL still get the URL in a form they can copy by hand.

#### Scenario: Successful copy
- **WHEN** a reader activates Copy link
- **THEN** the post's canonical URL is on the clipboard, and the control shows a "Copied" confirmation that is announced to assistive technology, then reverts after a few seconds

#### Scenario: Clipboard unavailable
- **WHEN** the clipboard API is missing or rejects the write
- **THEN** the reader is shown the canonical URL, already selected, so they can copy it manually

### Requirement: Native share sheet
When the browser supports the Web Share API, the share controls SHALL include a **Share…** control that opens the device's share sheet with the post title and canonical URL. When the browser does not support it, the control SHALL NOT be shown. This is how readers reach Zalo, Messenger, Telegram and other apps that have no dedicated button, including Zalo on `/viet/` posts.

#### Scenario: Supported browser
- **WHEN** a reader on a browser with Web Share support (for example mobile Safari or Chrome on Android) activates **Share…**
- **THEN** the device's share sheet opens with the post title and canonical URL

#### Scenario: Unsupported browser
- **WHEN** a reader's browser has no Web Share support
- **THEN** no **Share…** control is visible, and the other controls are unaffected

#### Scenario: Reader dismisses the sheet
- **WHEN** the reader closes the share sheet without choosing an app
- **THEN** nothing else happens, and no error is shown

#### Scenario: Zalo on a Vietnamese post
- **WHEN** a reader on a phone with Zalo installed opens a `/viet/` post and activates **Share…**
- **THEN** Zalo is one of the targets the share sheet offers

### Requirement: No third-party share scripts
The share controls SHALL NOT load scripts, iframes, fonts, images or tracking pixels from Facebook, X, WhatsApp, Zalo or any other third party. Nothing SHALL be requested from a platform until the reader activates that platform's control.

#### Scenario: Loading a post contacts no social platform
- **WHEN** a reader opens a post page and does not activate any share control
- **THEN** the browser makes no request to any facebook.com, x.com, twitter.com, whatsapp.com, wa.me or zalo.me host

### Requirement: Accessible, theme-aware controls
Each share control SHALL be reachable and usable from the keyboard, with a visible focus indicator. Each SHALL have an accessible name that states the action (for example "Share on Facebook"). Each SHALL stay legible in both the light and dark site themes.

#### Scenario: Keyboard use
- **WHEN** a reader tabs through the post's share controls
- **THEN** each control receives visible focus in turn, and Enter (plus Space on buttons) activates it

#### Scenario: Screen reader names
- **WHEN** a screen reader lists the share controls
- **THEN** each one is announced with an action name such as "Share on X" or "Copy link", not just an icon

#### Scenario: Dark theme
- **WHEN** the site is in the dark theme
- **THEN** the share controls' icons and focus rings meet at least 3:1 contrast against their background
