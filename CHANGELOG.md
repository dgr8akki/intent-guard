# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Intent Guard now requires Chrome 140 or later.

## [1.6.0] - 2026-09-27

### Added

- The active popup shows time in session (for example _42 min_, or _1:05 hr_), top right.
- While you're off task, a line says for how long and when the next nudge is due: _Off task for 3 min · nudge due_, _nudge in 1 min_, or _snoozed for 4 more min_.
- Sites you allowed from the nudge are listed under _Allowed this session_, each with a ✕ to stop allowing it.
- The popup updates live while open, as pages report in.

## [1.5.0] - 2026-09-27

### Changed

- Redesigned nudge card to match the popup and settings page: a double-rule masthead, a serif sentence with your task in bold, and a full-width Back to task button above It's part of it and 5 more minutes.
- The nudge card now follows the system light or dark theme instead of always being dark, with a hairline border and deep shadow so it stays legible on any page.

### Added

- The bundled Source Serif 4 upright font is a web-accessible resource, registered on the page under its own family name (`Intent Guard Serif`) so the page's fonts are never affected. See PRIVACY.md for the one side effect.

## [1.4.0] - 2026-09-27

### Changed

- Redesigned popup to match the settings page: double-rule masthead with a section label, the task written on a ruled line like a headline, and a 360px width.
- "Nudge after" is a segmented 1 / 2 / 5 / 10 min control (radio buttons with arrow-key support), 2 min by default.
- The active session shows your task as a headline that scales with its length.
- "1 site allowed" / "2 sites allowed" instead of "site(s) allowed".
- The bundled Source Serif 4 font moved to `src/fonts/`, shared by the popup and settings page.

### Added

- Press Enter in the task field to start a session; pasted line breaks become spaces.
- A character counter appears from 160 characters.

## [1.3.0] - 2026-09-27

### Changed

- Redesigned settings page: double-rule masthead, serif headline, bordered provider tiles, italic step numerals, and light and dark themes.
- Clearer states: a Welcome / Settings / Replace your key kicker, a spinner and read-only field while a key is checked, an outlined field on a rejected key, and an icon on every status message.
- Source Serif 4 is bundled with the extension (SIL Open Font License), so the page still makes no remote requests.

### Fixed

- Focusing the key field on first run no longer scrolls the welcome headline out of view.

## [1.2.1] - 2026-09-27

### Changed

- The Jev client now matches Slop Radar, Recipe Mode and Jev Voice: yes/no questions are translated to TypeSafe's `noul` type automatically, and `maskKey` lives in the client. No change in behaviour.

## [1.2.0] - 2026-09-27

### Added

- Choose your Jev provider in settings: TypeSafe directly (key from the TypeSafe console) or Vercel AI Gateway. Setup steps, key link and privacy line follow the choice.
- `npm run eval` uses `TYPESAFE_API_KEY` when set, otherwise `AI_GATEWAY_API_KEY`.

### Changed

- New host permission for `api.typesafe.ai`. Existing installs keep using Vercel until you switch.

## [1.1.0] - 2026-09-27

### Changed

- API key setup moved from the popup to a settings page that opens on install, with steps for creating a key and setting a spend limit.
- A saved key is never shown again: settings displays it masked (`vck_…a1b2`) with Test, Replace and Remove.
- The popup shows a Connect Jev prompt until a key is saved, then only the task; a ⚙ button opens settings.

## [1.0.0] - 2026-09-27

### Added

- Focus sessions: type what you're working on in the popup and pick how long you can drift (1, 2, 5 or 10 minutes) before a nudge.
- Every page you view during a session is judged against the task on a four-level scale (distraction, loosely related, useful, exactly the task), summing each side with a 60% threshold.
- Unclear pages neither start nor stop the drift clock.
- A calm corner nudge with Back to task (last on-task page), It's part of it (allow the site for the session) and 5 more minutes.
- Re-checks on tab switches and single-page-app navigation; sends only origin and path, title and up to 800 characters of text.
- One request at a time, cached per task and page; errors and rate limits never show on the page.
- Popup with session status and an API key check on save.

[1.6.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.6.0
[1.5.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.5.0
[1.4.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.4.0
[1.3.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.3.0
[1.2.1]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.2.1
[1.2.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.2.0
[1.1.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.1.0
[1.0.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.0.0
