# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-27

### Added

- Focus sessions: type what you're working on in the popup and pick how long you can drift (1, 2, 5 or 10 minutes) before a nudge.
- Every page you view during a session is judged against the task on a four-level scale (distraction, loosely related, useful, exactly the task), summing each side with a 60% threshold.
- Unclear pages neither start nor stop the drift clock.
- A calm corner nudge with Back to task (last on-task page), It's part of it (allow the site for the session) and 5 more minutes.
- Re-checks on tab switches and single-page-app navigation; sends only origin and path, title and up to 800 characters of text.
- One request at a time, cached per task and page; errors and rate limits never show on the page.
- Popup with session status and an API key check on save.

[1.0.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.0.0
