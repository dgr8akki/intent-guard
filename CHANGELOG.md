# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sensitive pages are never described to Jev: mail, banking, government, health and password-manager sites, sign-in pages, any page with a password field and any page marked `noindex` send only their origin, and count as neither on nor off task. Add your own under _Never send these sites_ in settings, or with _Don't judge this site_ in the popup while a session runs.
- The first time you start a session, the popup says what leaves the browser and where it goes, with a link to the list of sites that are never sent.

### Changed

- Intent Guard now requires Chrome 140 or later.
- The extension is listed as "Intent Guard: stay on task", with a new one-line description. Name and description come from `_locales` (English and British English).
- The nudge card uses Georgia instead of the bundled serif, so the extension no longer exposes a font file to web pages (a way for a site to tell the extension was installed).
- _It's part of it_ now allows the whole site: allowing `www.youtube.com` also covers `m.youtube.com` and `youtube.com`. The popup lists the site as `youtube.com`.
- Each judged page sends less: its heading and description, or at most 300 characters of opening text when it has neither (was up to 800 characters of body text). A site the model has already put on task is not asked about again during the session.
- Sessions end on their own after 90 minutes without a page being checked, or after 8 hours. After 4 hours the popup asks whether you're still on the task, with Continue and End.

### Fixed

- Tabs that were already open when you installed Intent Guard or started a session are now checked too; before, only pages loaded afterwards reported in. This adds the `scripting` permission.
- Checking a key is honest: a rate-limited provider reads "Key accepted; the provider is busy right now" instead of "Key works", being offline no longer marks the key wrong, and a reply that does not answer the question, or is not JSON, is rejected instead of saving the key.
- A provider failure during a session (rejected key, used-up budget, rate limit, offline, unexpected reply) is now visible: the popup says what went wrong under your task with a link to settings, the toolbar icon shows a badge until a check succeeds, and the worker logs it. Before, the popup kept reporting drift while every check failed.

## [1.1.0] - 2026-09-27

Everything shipped on 27 September after the first release, folded into one entry.

### Added

- Choose your Jev provider in settings: TypeSafe directly or Vercel AI Gateway. Setup steps, key link and privacy line follow the choice; `api.typesafe.ai` is a new host permission.
- The active popup shows time in session, a drift line (_Off task for 3 min · nudge due_, _nudge in 1 min_, or the snooze that is running) and the sites you allowed from the nudge, each with a cross to stop allowing it. It updates live while open.
- Press Enter in the task field to start a session; pasted line breaks become spaces. A character counter appears from 160 characters.

### Changed

- API key setup moved from the popup to a settings page that opens on install, with steps for creating a key and setting a spend limit. A saved key is never shown again: settings displays it masked with Test, Replace and Remove, and the popup shows a Connect Jev prompt until a key is saved.
- Redesigned the settings page, the popup and the nudge card as one set: serif type, double-rule masthead, provider tiles, a segmented 1 / 2 / 5 / 10 minute control, light and dark themes. The card follows the system theme instead of always being dark. Source Serif 4 is bundled under the SIL Open Font License, so the pages make no remote requests.
- The Jev client translates yes/no questions to TypeSafe's `noul` type and owns `maskKey`; no change in behaviour.

### Fixed

- Focusing the key field on first run no longer scrolls the welcome headline out of view.

## [1.0.0] - 2026-09-27

### Added

- Focus sessions: type what you're working on in the popup and pick how long you can drift (1, 2, 5 or 10 minutes) before a nudge.
- Every page you view during a session is judged against the task on a four-level scale (distraction, loosely related, useful, exactly the task), summing each side with a 60% threshold.
- Unclear pages neither start nor stop the drift clock.
- A calm corner nudge with Back to task (last on-task page), It's part of it (allow the site for the session) and 5 more minutes.
- Re-checks on tab switches and single-page-app navigation; sends only origin and path, title and up to 800 characters of text.
- One request at a time, cached per task and page; errors and rate limits never show on the page.
- Popup with session status and an API key check on save.

[Unreleased]: https://github.com/dgr8akki/intent-guard/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/dgr8akki/intent-guard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.0.0
