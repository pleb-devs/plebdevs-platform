# Config System Gap Notes (PlebDevs Fork)

Purpose: record the original config-surface gaps we hit, and note their upstream resolution status.

## Status (Now Resolved Upstream)

As of `upstream/main` commit `3e090de` (fetched on 2026-02-28), the key gaps listed below are now implemented in `pleb.school` and documented in `config/README.md`.

Result: for our current PlebDevs branding goals (hero video, hero demo CTA destination, default dark mode with toggle visible, single default theme/font), we can now configure behavior through `/config` without custom source patches.

## Original Gaps We Hit

1. Homepage demo CTA routing
- Needed config key: `homepage.hero.buttons.watchDemoHref`
- Requirement: support both internal links and external URLs.

2. Hero visual video rendering
- Needed config keys:
  - `homepage.visual.videoUrl`
  - `homepage.visual.videoPoster` (optional)
- Requirement: preserve static visual fallback when no video is configured.

3. Theme/font lock semantics
- Needed behavior:
  - If `ui.showThemeSelector=false`, ignore saved `complete-theme`.
  - If `ui.showFontToggle=false`, ignore saved `font-override`.
  - If `ui.showThemeToggle=false` and `defaults.darkMode` is set, force the mode.

## Current Recommendation

Keep customization config-first:
- `config/copy.json` for homepage/media/brand copy
- `config/theme.json` for default theme/font/dark-mode and toggle visibility
- `config/nostr.json` and `config/admin.json` for environment/community settings

Only reopen source edits if a future customization requirement cannot be expressed in these configs.
