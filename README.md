<div align="center">

<img src="assets/icon.svg" width="72" height="72" alt="" />

# Intent Guard

**Say what you're working on. Get a gentle nudge when you drift.** Every page you open is judged against your task, not a blocklist, so the tutorial you need stays open and the rabbit hole gets a tap on the shoulder.

[![CI](https://github.com/dgr8akki/intent-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/dgr8akki/intent-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2b3440.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-2b3440.svg)
![Chrome 140+](https://img.shields.io/badge/chrome-140%2B-2b3440.svg)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/nudge-dark.png" />
  <img src="docs/nudge-light.png" width="520" alt="A short-video feed with the Intent Guard nudge card in the bottom-right corner, set in a serif under a double rule: This doesn’t look like part of “Compare flights to Goa for December”, with a full-width Back to task button and It’s part of it and 5 more minutes below it." />
</picture>

</div>

## Features

- **Judges meaning, not URLs.** A YouTube tutorial for your task is on task; YouTube Shorts isn't. No lists to maintain.
- **Lets you drift a little.** The nudge only appears after you've been off task for the time you choose (1, 2, 5 or 10 minutes).
- **Honest about doubt.** A page is only on or off task when one side of the scale holds 60% of the probability. Unclear pages neither start nor stop the clock.
- **One click back.** **Back to task** returns to the last on-task page; **It's part of it** allows the site for the session; **5 more minutes** snoozes.
- **See where you stand.** During a session the popup shows how long you've been at it, whether you're drifting and when the next nudge is due, and the sites you've allowed, each with a ✕ to stop allowing it.
- **Bring your own key.** Use a TypeSafe key directly or a Vercel AI Gateway key.
- **Cheap and fast.** One Jev call per page (about 150 ms), cached for the session. Jev costs $0.042 per million input tokens.
- **Quiet when off.** Nothing is sent to anyone unless a session is running.
- **Skips what it shouldn't see.** Mail, banking, government, health and password-manager sites, sign-in pages, and any page with a password field or marked `noindex` are never described to Jev. Add your own under **Never send these sites**.

## How it works

Intent Guard is built on [Jev](https://typesafe.ai), TypeSafe's System One model. Jev doesn't generate text: it answers typed questions with probabilities.

Each time a page is shown or its URL changes, one request asks:

| Question                                           | Levels                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| How much does this page help with the user's task? | Distraction · Loosely related · Useful for the task · Exactly the task |

The verdict comes from **summing each side of the scale**. A page that's 55% "useful" and 37% "exactly the task" is 92% on task, even though no single level is confident.

"Loosely related" counts as drift on purpose: reading the Wikipedia history of Goa while you're meant to be booking flights is how rabbit holes start. If it really is part of the task, one click allows the site.

## Install

Intent Guard isn't on the Chrome Web Store yet. To install from source:

1. Download the latest `intent-guard-x.y.z.zip` from [Releases](https://github.com/dgr8akki/intent-guard/releases) and unzip it, or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (or `src/` in a clone).
4. The settings page opens on install. Pick where your key comes from, **TypeSafe** ([create a key](https://console.typesafe.ai/keys)) or **Vercel AI Gateway** ([create a key](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys)), paste it and select **Connect**. The key is checked before it's saved. (Later: the ⚙ in the popup.)
5. Click the Intent Guard icon, type what you're working on and press **Start**.

With Vercel, set a [spend limit](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets) on the key. Either way, a full day of browsing costs well under a cent.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/options-dark.png" />
  <img src="docs/options-light.png" width="520" alt="The Intent Guard settings page: a Connect Jev card with a choice between Vercel AI Gateway and TypeSafe, setup steps for the chosen provider, an API key field and a Connect button." />
</picture>

Once connected, the key shows only as `vck_…a1b2` with **Test**, **Replace** and **Remove**, and the popup is just your task:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/popup-dark.png" />
  <img src="docs/popup-light.png" width="360" alt="The Intent Guard popup: a “What are you working on?” headline field on a ruled line, a Nudge after 1 / 2 / 5 / 10 min segmented control with 2 min selected, and a Start button with an Enter hint." />
</picture>

## Privacy and permissions

| Permission                          | Why                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Content script on all http(s) pages | Reads the page title and opening text during a session; shows the nudge                      |
| `https://api.typesafe.ai/*`         | Sends the task and page summary to Jev, if you picked TypeSafe                               |
| `https://ai-gateway.vercel.sh/*`    | Sends the task and page summary to Jev, if you picked Vercel                                 |
| `storage`                           | Keeps your API key and session in this browser                                               |
| `scripting`                         | Adds the page checker to tabs that were already open when you installed or started a session |

For each page, only the origin and path, the title and up to 800 characters of heading and opening text are sent, either to TypeSafe directly or to Vercel AI Gateway, which forwards them to TypeSafe. Query strings, URL fragments, form contents and embedded frames are never sent. Mail, banking, government, health and password-manager sites, sign-in pages, and any page with a password field or marked `noindex` are never described at all, and you can add your own sites under **Never send these sites** in settings (or **Don't judge this site** in the popup). See [PRIVACY.md](PRIVACY.md).

## Development

Requires Node.js 22 or later.

```sh
npm install
npm run check      # lint + format check + unit tests
npm run eval       # live evaluation against Jev (needs TYPESAFE_API_KEY or AI_GATEWAY_API_KEY in .env)
npm run package    # builds dist/intent-guard-<version>.zip for the Chrome Web Store
```

| Script            | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `npm test`        | Unit tests with `node:test`; Jev and Chrome are faked               |
| `npm run lint`    | ESLint                                                              |
| `npm run format`  | Prettier                                                            |
| `npm run eval`    | Real Jev judgments of sample task/page pairs; waits out rate limits |
| `npm run icons`   | Renders `assets/icon.svg` to PNGs with headless Chrome              |
| `npm run package` | Zips `src/` for upload and checks the version numbers match         |

### Project structure

```
src/
├── manifest.json
├── background.js          Service worker: judges pages, keeps the session and drift clock
├── content/               Page snapshot, URL-change polling and the nudge
├── popup/                 Start/end a session
├── options/               Connect, test, replace or remove the API key (opens on install)
└── lib/
    ├── jev.js             Jev client: retries, rate-limit pauses, clear errors
    └── guard.js           Question, verdict rules, drift clock, one-at-a-time judge
test/                      Unit tests (jsdom page for the content script)
evals/                     Live evaluation against Jev
```

### Tests

- **Unit tests** cover the verdict rules, the drift clock (start, reset, unclear pages, snooze, allowed sites), the judge's caching and queueing, and the content script running in jsdom (what it sends, when it nudges, the nudge buttons).
- **The live evaluation** judges eight hand-written task/page pairs with the real model, including tricky ones like Hacker News showing a Postgres headline while you're fixing a Postgres bug.
  If you change `QUESTIONS` or the verdict threshold in `guard.js`, run it again and keep it at 100%; add a sample for any new behaviour.

### Releasing

1. Bump `version` in `package.json` and `src/manifest.json` (a test checks they match) and add a `CHANGELOG.md` entry.
2. `npm run check && npm run eval && npm run package`.
3. Upload `dist/intent-guard-<version>.zip` to the Chrome Web Store and attach it to a GitHub release.

## Troubleshooting

| Problem                        | Fix                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| No nudge ever appears          | Check a session is running and your key is saved. Reload tabs opened before installing.        |
| Nudged on a page you need      | Click **It's part of it** to allow the site for this session, or phrase the task more broadly. |
| Nothing on `chrome://` or PDFs | Chrome doesn't let extensions run there. Those pages don't count either way.                   |
| Nudge is late                  | TypeSafe may be rate-limiting; Intent Guard stays quiet and re-checks on the next navigation.  |

## Limitations

- Judges the title and opening text only; a page whose relevant part is far down may be judged by its header.
- Endless feeds on one URL are judged once per visit, not per scroll.
- English-language prompts; pages in other languages are judged less reliably.

## License

[MIT](LICENSE) © 2026 Aakash Pahuja

The settings page, popup and nudge card bundle [Source Serif 4](https://github.com/adobe-fonts/source-serif) © Adobe, under the [SIL Open Font License 1.1](src/fonts/OFL.txt).
