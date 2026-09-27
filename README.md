# Intent Guard

Say what you're working on. Intent Guard nudges you when you drift to pages that aren't part of it.

Site blockers work from a fixed list of URLs, so they can't tell a YouTube tutorial you need from a YouTube rabbit hole. Intent Guard judges each page against **your task**, in about 150 ms, using [Jev](https://typesafe.ai), TypeSafe's System One decision model.

## How it works

1. Open the popup and type your task, e.g. _"Compare flights to Goa for December"_. Pick how long you can drift before a nudge (default 2 minutes).
2. Browse as usual. Each time a page loads or you switch tabs, Jev scores it against the task: distraction, loosely related, useful, or exactly the task.
3. Once you've been off task for the set time, a small card appears in the corner:
   - **Back to task**: returns to the last on-task page.
   - **It's part of it**: allows this site for the rest of the session.
   - **5 more minutes**: snoozes.

Pages that are unclear neither start nor stop the clock, so one ambiguous page can't reset a stretch of scrolling.

## Install (developer mode)

```sh
git clone https://github.com/dgr8akki/intent-guard && cd intent-guard
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `src/` folder.
2. Click the Intent Guard icon, paste an [AI Gateway API key](https://vercel.com/dashboard) and save.
3. Type your task and press **Start**.

## Development

```sh
npm install
npm run check    # lint + format + unit tests (offline)
npm run eval     # live Jev evaluation; needs AI_GATEWAY_API_KEY in .env
npm run package  # dist/intent-guard-<version>.zip
```

See [AGENTS.md](AGENTS.md) for architecture and rules, and [PRIVACY.md](PRIVACY.md) for what leaves your browser.

## License

[MIT](LICENSE)
