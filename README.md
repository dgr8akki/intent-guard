# Intent Guard

Type what you're working on. Intent Guard checks each page against that, so a YouTube tutorial for your task is fine and YouTube Shorts gets you a "back to task" card after a couple of minutes. It is a way to stay focused without a website blocker.

[![CI](https://github.com/dgr8akki/intent-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/dgr8akki/intent-guard/actions/workflows/ci.yml)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/nudge-dark.png" />
  <img src="docs/nudge-light.png" width="520" alt="A short-video feed with the Intent Guard card in the bottom-right corner: This doesn't look like part of &quot;Compare flights to Goa for December&quot;, with a Back to task button and It's part of it and 5 more minutes below it." />
</picture>

## Why not a blocker

Blocklists judge domains, and work does not happen by domain. The documentation I need is on the same site as the video I should not be watching. The article that is half research and half procrastination lives on a site I could not have listed in advance.

Intent Guard reads the heading of the page you are on and asks one question: does this help with the task you typed? You pick how long you're allowed to wander (1, 2, 5 or 10 minutes) before it says anything. After that, a small card appears in the corner of the page. It has three buttons: Back to task (goes to the last page that was on task), It's part of it (allow this site for the session), and 5 more minutes. Escape snoozes it too. Nothing is blocked and nothing makes a sound. If you keep browsing, the card does not come back until another drift period has passed.

"Loosely related" counts as off task. Reading about Goa's history when you're meant to be booking a flight is exactly the thing this is for. If you disagree, one click allows the site.

## Install

Intent Guard isn't on the Chrome Web Store yet. To install from source:

1. Download the latest `intent-guard-x.y.z.zip` from [Releases](https://github.com/dgr8akki/intent-guard/releases) and unzip it, or clone this repo.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click Load unpacked and select the unzipped folder (or `src/` in a clone).
4. The settings page opens on install. Pick where your key comes from, [TypeSafe](https://console.typesafe.ai/keys) or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys), paste it and select Connect. The key is checked before it's saved. (Later, the gear in the popup opens the same page.)
5. Click the Intent Guard icon, type what you're working on and press Start session.

You bring your own key. With Vercel, put a [spend limit](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets) on it. A day of browsing costs less than a cent either way; in September 2026 TypeSafe charged $0.042 per million input tokens.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/options-dark.png" />
  <img src="docs/options-light.png" width="520" alt="The Intent Guard settings page: a Connect Jev card with a choice between Vercel AI Gateway and TypeSafe, setup steps for the chosen provider, an API key field and a Connect button." />
</picture>

## A session

Once connected, the popup is just a field: "What are you working on?" Type the task, pick the drift time and start. From then on the popup shows the session clock, whether you're currently off task and when the next card is due, and which sites you've allowed, each with a cross to un-allow it. There is also a Don't judge this site button for the page you're looking at.

If it can't tell, it does nothing: unclear pages don't start or stop the clock. Sessions end on their own after 90 minutes without a page being checked, or after 8 hours. Past 4 hours the popup asks whether you're still on it. When no session is running it sends nothing at all.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/popup-dark.png" />
  <img src="docs/popup-light.png" width="360" alt="The Intent Guard popup: a What are you working on? field on a ruled line, a Nudge after 1 / 2 / 5 / 10 min control with 2 min selected, and a Start session button." />
</picture>

## How it decides

Intent Guard uses [Jev](https://typesafe.ai), TypeSafe's System One model. Jev doesn't generate text; it answers typed questions with probabilities. One request per page, cached until you close the browser, asks:

| Question                                           | Levels                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| How much does this page help with the user's task? | Distraction · Loosely related · Useful for the task · Exactly the task |

The verdict comes from adding up each side of the scale. A page that's 55% "useful" and 37% "exactly the task" is 92% on task, even though no single level is confident. A side needs 60% to decide; anything in between is unclear and leaves the clock alone. A site the model has already put on task is not asked about again during the session.

## What leaves your browser

| Permission                          | Why                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content script on all http(s) pages | Reads the page heading and description during a session; shows the card. Plain-http pages are included so intranet and local tools count as work too |
| `https://api.typesafe.ai/*`         | Sends the task and page summary to Jev, if you picked TypeSafe                                                                                       |
| `https://ai-gateway.vercel.sh/*`    | Sends the task and page summary to Jev, if you picked Vercel                                                                                         |
| `storage`                           | Keeps your API key, session and never-send list in this browser                                                                                      |
| `scripting`                         | Adds the page checker to tabs that were already open when you installed or started a session                                                         |
| Host access on all http(s) pages    | Lets the extension see which tabs are open pages and reach them; the content script already runs there, so Chrome shows the same warning             |

For each page, only the origin and path, the title and its heading and description (or up to 300 characters of opening text when it has neither) are sent, either to TypeSafe directly or to Vercel AI Gateway, which forwards them to TypeSafe. Query strings, URL fragments, form contents and embedded frames are never sent. Mail, banking, government, health and password-manager sites, sign-in pages, and any page with a password field or marked `noindex` are never described at all; add your own under Never send these sites in settings, or with Don't judge this site in the popup. The full policy is in [PRIVACY.md](PRIVACY.md).

## When it does nothing

| What you see                   | Why, and what to do                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| No card ever appears           | Check a session is running and your key is saved. The popup shows a line under your task when checks fail. |
| A card on a page you need      | Click It's part of it to allow the site for this session, or phrase the task more broadly.                 |
| Nothing on `chrome://` or PDFs | Chrome doesn't let extensions run there. Those pages don't count either way.                               |
| The card is late               | The provider may be rate-limiting; the next page re-checks.                                                |

Known limits: it judges the heading and opening text only, so a page whose relevant part is far down may be judged by its header. Endless feeds on one URL are judged once per visit, not per scroll. The prompt is in English, and pages in other languages are judged less reliably.

## Development

Requires Node.js 22 or later.

```sh
npm install
npm run check      # lint, format check and unit tests
npm run eval       # live evaluation against Jev (needs TYPESAFE_API_KEY or AI_GATEWAY_API_KEY in .env)
npm run icons      # re-render src/icons from assets/icon.svg with headless Chrome
npm run package    # builds dist/intent-guard-<version>.zip for the Chrome Web Store
```

```
src/
├── manifest.json
├── background.js          Service worker: wires storage and tabs to lib/service.js
├── content/               Page snapshot, URL-change detection and the card
├── popup/                 Start and end a session
├── options/               Connect, test, replace or remove the API key; never-send list (opens on install)
└── lib/
    ├── jev.js             Jev client (shared with the sibling extensions, see SHARED.md)
    ├── guard.js           Question, verdict rules, drift clock, judge cache
    ├── service.js         What the worker decides, behind a storage adapter
    └── exclusions.js      Sites that are never described
test/                      Unit tests; jsdom pages for the content script, popup and settings
test/live/                 Live check against the real model (npm run eval)
```

Unit tests cover the verdict rules, the drift clock, the judge's caching and queueing, the worker's message handling, and the content script, popup and settings pages running in jsdom. The live check (`npm run eval`) judges nine task/page pairs I have actually typed with the real model, including tricky ones like Hacker News showing a Postgres headline while you're fixing a Postgres bug. If you change `QUESTIONS` or the verdict threshold in `guard.js`, run it again and keep it at 100%; add a sample for any new behaviour.

To release: bump `version` in `package.json` and `src/manifest.json` (a test checks they match), add a `CHANGELOG.md` entry, run `npm run check && npm run eval && npm run package`, then upload `dist/intent-guard-<version>.zip` to the Chrome Web Store and attach it to a GitHub release.

## See also

Three more extensions built on Jev by the same author: [Slop Radar](https://github.com/dgr8akki/slop-radar) rates the writing style of posts in a feed, [Recipe Mode](https://github.com/dgr8akki/recipe-mode) reads recipes aloud and takes voice commands in the kitchen, and [Jev Voice](https://github.com/dgr8akki/jev-voice) drives web pages by voice.

## License

[MIT](LICENSE) © 2026 Aakash Pahuja

The settings page and popup bundle [Source Serif 4](https://github.com/adobe-fonts/source-serif) © Adobe, under the [SIL Open Font License 1.1](src/fonts/OFL.txt).
