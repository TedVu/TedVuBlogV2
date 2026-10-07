# Spec Delta

## Purpose

Lets readers view the site in a light or dark color theme that matches their OS preference by default, with a toggle to override it and remember their choice.

## ADDED Requirements

### Requirement: Light and dark themes
The site SHALL provide two color themes, light and dark, and every page SHALL render in exactly one of them. The light theme SHALL keep the site's current appearance: sky-blue background, dark text, blue accent. The dark theme SHALL use a navy background with light text and a lightened accent. In both themes, body text and link text SHALL meet a WCAG AA contrast ratio of at least 4.5:1 against the page background.

#### Scenario: Light theme matches the current site
- **WHEN** a page renders in the light theme
- **THEN** the background, text, heading and accent colors match the site's appearance before this change

#### Scenario: Dark theme uses the navy palette
- **WHEN** a page renders in the dark theme
- **THEN** the page background is navy, body and heading text are light, and links use the lightened accent color

#### Scenario: Readable contrast in both themes
- **WHEN** body text or link text is measured against the page background in either theme
- **THEN** the contrast ratio is at least 4.5:1

### Requirement: All site elements follow the active theme
Every styled element on every page SHALL take its colors from the active theme. This includes header, navigation, footer, post content, code blocks, tables, blockquotes, horizontal rules, the blog search input, post dates and text selection. Third-party brand marks (the LinkedIn icon) MAY keep their brand colors.

#### Scenario: No light-theme colors leak into dark mode
- **WHEN** any page is viewed in the dark theme
- **THEN** no element shows a light-theme background or dark-on-dark text, except third-party brand marks

#### Scenario: Native controls match the theme
- **WHEN** the dark theme is active
- **THEN** scrollbars and native form controls such as the search input render in their dark variants

### Requirement: Initial theme selection
When a page loads, the site SHALL choose the theme as follows. If the reader has saved a theme choice, the site SHALL use it. Otherwise it SHALL use the reader's OS color-scheme preference. If neither is available, it SHALL use the light theme.

#### Scenario: First visit with OS set to dark
- **WHEN** a reader with no saved choice and an OS dark preference opens any page
- **THEN** the page renders in the dark theme

#### Scenario: First visit with OS set to light or no preference
- **WHEN** a reader with no saved choice and an OS light preference, or no preference, opens any page
- **THEN** the page renders in the light theme

#### Scenario: Saved choice overrides OS preference
- **WHEN** a reader who saved "light" opens a page while their OS prefers dark
- **THEN** the page renders in the light theme

#### Scenario: Storage unavailable
- **WHEN** browser storage cannot be read, for example because it is blocked or in a private mode that throws
- **THEN** the site falls back to the OS preference and does not throw an error

### Requirement: Theme toggle
The site header on every page SHALL contain a toggle control with two states, light and dark. Activating it SHALL switch the page to the other theme immediately, without a page reload, and SHALL save the new theme as the reader's choice. The toggle SHALL be keyboard-operable. It SHALL expose an accessible name and state, and SHALL show which theme is active.

#### Scenario: Switching from light to dark
- **WHEN** the reader activates the toggle while the light theme is active
- **THEN** the page switches to the dark theme without reloading, and "dark" is saved as the reader's choice

#### Scenario: Choice persists across visits
- **WHEN** the reader has switched to dark and later opens the site in a new tab or session
- **THEN** the page renders in the dark theme

#### Scenario: Keyboard and assistive technology
- **WHEN** a keyboard user focuses the toggle and presses Enter or Space
- **THEN** the theme switches, and assistive technology announces the control's name and updated state

### Requirement: Live OS preference tracking before a choice is saved
While the reader has no saved theme choice, the site SHALL follow changes to the OS color-scheme preference without a reload. Once a choice is saved, OS preference changes SHALL NOT change the theme.

#### Scenario: OS switches to dark with no saved choice
- **WHEN** a reader with no saved choice has a page open and their OS changes from light to dark
- **THEN** the page switches to the dark theme without reloading

#### Scenario: OS change ignored after a choice is saved
- **WHEN** a reader who saved "light" has a page open and their OS changes to dark
- **THEN** the page stays in the light theme

### Requirement: No flash of the wrong theme
The correct theme SHALL be applied before the page's first paint on a full page load, and before the new content paints on client-side navigation between pages. At no point SHALL the reader see a frame rendered in the other theme.

#### Scenario: Full page load in dark theme
- **WHEN** a reader whose theme resolves to dark loads or hard-refreshes any page
- **THEN** the first painted frame is already in the dark theme

#### Scenario: Client-side navigation keeps the theme
- **WHEN** a reader in the dark theme follows an internal link that the site handles as a client-side page swap
- **THEN** the new page renders in the dark theme with no light frame between pages, and the toggle shows the dark state
