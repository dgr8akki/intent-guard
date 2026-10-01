# Changelog

Every release of Intent Guard, latest on top. Sections are the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ones and versions are [semver](https://semver.org/): a minor bump changes what the guard does, a patch fixes how it does it.

## [1.2.0] - 2026-10-01

### Added

- Sensitive pages are never described to Jev: mail, banking, government, health and password-manager sites, sign-in pages, any page with a password field and any page marked `noindex` send only their origin, and count as neither on nor off task. Add your own under _Never send these sites_ in settings, or with _Don't judge this site_ in the popup while a session runs.
- The first time you start a session, the popup says what leaves the browser and where it goes, with a link to the list of sites that are never sent.
- Escape snoozes the nudge while it is showing, and the snooze button shows the Esc hint.
- The key field in settings has a Show/Hide button.

### Changed

- Intent Guard now requires Chrome 140 or later.
- The extension is listed as "Intent Guard: stay on task", with a new one-line description. Name and description come from `_locales` (English and British English).
- The nudge card uses Georgia instead of the bundled serif, so the extension no longer exposes a font file to web pages (a way for a site to tell the extension was installed).
- _It's part of it_ now allows the whole site: allowing `www.youtube.com` also covers `m.youtube.com` and `youtube.com`. The popup lists the site as `youtube.com`.
- Each judged page sends less: its heading and description, or at most 300 characters of opening text when it has neither (was up to 800 characters of body text). A site the model has already put on task is not asked about again during the session.
- Sessions end on their own after 90 minutes without a page being checked, or after 8 hours. After 4 hours the popup asks whether you're still on the task, with Continue and End.
- Verdicts are kept in session storage until the browser closes, not in the worker's memory, so switching back to a tab after the worker has slept no longer costs a new request. The privacy policy and the store listing now say what that cache holds: task, URL, title and verdict, up to 500 entries.
- With no session running, tabs no longer check their address every second. During a session only a change of origin or path gets a page judged again, not a new query string or hash.
- Popup wording: the setup line says the key step happens once, the button says what it starts, and the line under a running session says when it began and how long off task brings up the nudge. The settings intro says it runs on your key and sends nothing without a session.
- Quotes and apostrophes in the nudge, popup and settings are straight ones. The lock icon, the uppercase section labels, the arrow on outside links and the hover animation on the nudge's buttons are gone.

### Fixed

- Tabs that were already open when you installed Intent Guard or started a session are now checked too; before, only pages loaded afterwards reported in. This adds the `scripting` permission.
- Checking a key is honest: a rate-limited provider reads "Key accepted; the provider is busy right now" instead of "Key works", being offline no longer marks the key wrong, and a reply that does not answer the question, or is not JSON, is rejected instead of saving the key.
- A provider failure during a session (rejected key, used-up budget, rate limit, offline, unexpected reply) is now visible: the popup says what went wrong under your task with a link to settings, the toolbar icon shows a badge until a check succeeds, and the worker logs it. Before, the popup kept reporting drift while every check failed.
- A tab keeps checking after one failed check, so the badge clears once the provider answers again. Before, one failure made the tab stop checking for the rest of the session.
- Every recheck used to start one more five-second address check on the page while the old one kept running, so they piled up over a session. Only one runs now.
- Adding a site to _Never send these sites_ applies to its open pages straight away instead of after a reload.
- Open tabs hear when a session starts or ends instead of waiting for the next tab switch or navigation.
- On single-page apps the nudge shows once per off-task stretch. It used to come back after every click.
- _Back to task_ no longer sends you to a page on a site you allowed and then took off the list.
- Popup: focus moves to End session after you press Start; the allowed-sites list no longer rebuilds every 15 seconds, so focus on a _Stop allowing_ button stays put; screen readers hear the elapsed time as "1 hour 5 minutes" and that Enter starts the session; long site names wrap and the task field grows as you type. The task placeholder passes contrast.
- The popup and settings page have real headings and a main landmark.
- At 400% zoom the nudge scrolls inside the window instead of losing its lower buttons off screen.
- Settings: pressing Connect with an empty field says "Paste your API key first."; the field border passes 3:1; the connection card fits above the fold in a laptop-sized window; after Connect focus lands on Test, and after Cancel on Replace.

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

[1.2.0]: https://github.com/dgr8akki/intent-guard/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dgr8akki/intent-guard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dgr8akki/intent-guard/releases/tag/v1.0.0
