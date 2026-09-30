# Chrome Web Store listing

Everything below is ready to paste into the Developer Dashboard. Character limits are noted where the dashboard enforces one. The summary comes from `description` in `src/manifest.json` and cannot be edited in the dashboard.

## Store listing tab

### Title (45 characters max)

Intent Guard: stay on task

### Summary (132 characters max, from the manifest)

Tell it what you're working on. Wander onto unrelated pages for a few minutes and a small card asks you back.

### Detailed description (16,000 characters max, plain text)

```text
Type what you're working on. Every page you open is checked against it, and after a few minutes on pages that aren't part of it a small card appears: Back to task. Nothing is sent when no session is running.

There is no blocklist to maintain. The same site can hold the tutorial you need and the feed you should not be in, so Intent Guard reads the heading of the page you are on and asks one question: does this help with the task you typed? It uses Jev, a decision model from TypeSafe that answers with probabilities rather than text. Being loosely related counts as off task; reading about Goa's history while you are meant to be booking a flight to Goa is what this is for. If you disagree, one click allows the site for the session.

How a session works
Click the icon, type your task, pick how long you may wander (1, 2, 5 or 10 minutes) and press Start session. Each page is placed on a four-level scale: distraction, loosely related, useful for the task, exactly the task. The two "on" levels are added up, and so are the two "off" levels. A side needs 60% to decide, and an unclear page leaves the drift clock alone. Once you have been off task for your chosen time, a card appears in the bottom-right corner of the page. No sound, no animation, and it takes no focus from what you were doing. Back to task returns to the last page that was on task. It's part of it allows the site for the rest of the session. 5 more minutes (or the Escape key) snoozes. While you browse on, the card does not come back until another drift period has passed.

The popup shows the session clock, whether you are off task and when the next card is due, the sites you have allowed, and a Don't judge this site button for the page you are on. Sessions end on their own after 90 minutes without a page check, or after 8 hours. If the provider stops answering, the popup says so under your task and the toolbar icon shows a badge until a check succeeds.

Before you start
You need your own API key: a TypeSafe key (console.typesafe.ai/keys) or a Vercel AI Gateway key (vercel.com/docs/ai-gateway). The settings page opens on install. Pick the provider, paste the key, press Connect. The key is tested before it is saved and is never shown again. A day of browsing costs less than a cent, billed to your own account, and with Vercel you can put a spend limit on the key.

Privacy
No servers, accounts or analytics. During a session, for each page you view, this goes to the provider you picked (TypeSafe directly, or Vercel AI Gateway, which forwards it to TypeSafe): your task, the page's origin and path, its title, and its heading and description, or up to 300 characters of opening text when it has neither. Query strings, URL fragments, form contents, cookies and embedded frames are never sent. Webmail, banking, government, health and password-manager sites, sign-in pages, any page with a password field and any page marked noindex are never described at all, and you can add sites of your own. Judgments are cached until you close the browser. Your key is sent as a bearer token on each request, to the provider that issued it and nowhere else. Full policy: github.com/dgr8akki/intent-guard/blob/main/PRIVACY.md

Permissions, in plain words
Read and change data on all websites: to read the heading of the page you are on during a session and to draw the card. There is no way to judge a page without running on it. The same access lets the extension reach tabs that were already open when you installed it or started a session.
Access to api.typesafe.ai and ai-gateway.vercel.sh: to send the page summary for judging, to whichever of the two you picked.
Storage: your key, the current session, the never-send list and the last failed check.

Requires Chrome 140 or later. Open source under the MIT licence: github.com/dgr8akki/intent-guard. Bugs and ideas: github.com/dgr8akki/intent-guard/issues
```

### Category and language

Category: Well-being. Second choice: Workflow & Planning. Default language: English (United Kingdom). Add the same listing text under English (United States), English (India), English (Australia) and English (Canada); the extension ships `_locales/en` and `_locales/en_GB`, and the store falls back to `en` for the rest.

### URLs

- Official URL: leave empty (a repo cannot be verified in Search Console).
- Homepage URL: https://github.com/dgr8akki/intent-guard
- Support URL: https://github.com/dgr8akki/intent-guard/issues
- Privacy policy URL: https://github.com/dgr8akki/intent-guard/blob/main/PRIVACY.md (the repo must be public for the reviewer to load it).

## Privacy practices tab

### Single purpose

```text
Intent Guard shows the user a card when they drift from a task they typed. During a session the user has started, it judges each page the user views for relevance to that task and, after the user has been off task for the number of minutes they chose, shows a dismissable card on the page with a link back to the last on-task page.
```

### Permission justifications

storage

```text
Keeps the user's API key and chosen provider (TypeSafe or Vercel AI Gateway); the current session (task text, start time, chosen drift minutes, allowed sites, sites already judged on task, when the current off-task stretch began, the last on-task URL, when a page last reported in); the user's list of sites never to send; whether the one-time note about what is sent has been dismissed; and the last failed check, so the popup can report a provider problem. Access level is TRUSTED_CONTEXTS, so content scripts cannot read the key. Relevance judgments are cached in chrome.storage.session and cleared when the browser closes. No history of pages visited is kept.
```

host_permissions: https://api.typesafe.ai/*

```text
Lets the service worker POST the task and page summary to TypeSafe's Jev API for a relevance judgment when the user has chosen TypeSafe as their provider. Requests carry the user's own API key. Not used while the provider is Vercel.
```

host_permissions: https://ai-gateway.vercel.sh/*

```text
Lets the service worker POST the same request to Vercel AI Gateway, which forwards it to the same model, when the user has chosen Vercel. Not used while the provider is TypeSafe. Both hosts are declared because the user picks between them in settings.
```

Host permissions (content script on `http://*/*` and `https://*/*`, plus matching `host_permissions`)

```text

The extension's purpose is to judge whether the page the user is on serves the task they typed, so the script must be able to run on any http or https page. It reads nothing of the page unless a session is running. Then, when the page is shown or its path changes, it sends the origin and path (query string and fragment stripped), the title, and the heading and meta description, or up to 300 characters of opening text when there are neither. Pages on a built-in list (webmail, banking, government, health, password managers, sign-in pages), pages with a password field or marked noindex, and sites the user adds are never described: only their origin reaches the extension itself and the provider is not called. The script draws the card in a shadow root, never reads form fields, cookies or frames, and makes no network requests. The host permissions mirror the content script's matches so the worker can see and message open tabs; Chrome shows the same install warning either way.
```

scripting

```text
On install and whenever a session starts, the service worker adds the same content script to http and https tabs that were already open, so a user who starts their first session in existing tabs is checked there too. It injects only the extension's own content/content.js, which is a no-op on a page that already has it. It never runs remote or dynamic code.
```

Remote code

```text
No. All code ships in the package. No remote scripts, no eval, no dynamic import from a URL. Network traffic is limited to POST requests to the chosen model API, which return JSON probabilities. Fonts are bundled. The card's markup is a constant template; the user's task is inserted with textContent.
```

### Data usage disclosure

Tick:

- Web history: the origin and path of every judged page during a session, plus its title, are sent to the provider. Query strings and fragments are stripped, but this is browsing history by any honest reading.
- Website content: the heading and description, or up to 300 characters of opening text, per judged page.
- User activity: the task the user typed is sent with every judgment, and the drift clock is a record of browsing behaviour, even though it stays local.
- Authentication information: the API key is stored and sent as a bearer token to its issuer.

Leave unticked, and why:

- Personal communications: webmail hosts are on the built-in never-send list, pages with a password field are skipped, and form contents and frames are never read, so the body of an email or message is not sent. Decision D-NEW-IG-4.
- Personally identifiable information, health, financial, location: nothing identifies the user, and banking, health and government sites are on the never-send list. A page's heading could contain a name, but that is website content.

Certifications, all three ticked truthfully: no sale or transfer outside approved use cases (summaries go to TypeSafe or Vercel only to produce the verdict); no use unrelated to the single purpose (no analytics or telemetry); no creditworthiness or lending use.

## Distribution tab

Visibility: Unlisted for the first upload, then Public. Regions: all. Pricing: free. Mature content: no. Publisher display name: Aakash Pahuja. Contact: pahujaaakash5@gmail.com. Trader declaration: non-trader.

## Release notes (300 characters max; used on the GitHub release)

```text
Sensitive pages (webmail, banking, sign-in, anything with a password field) are never sent. Provider failures show in the popup and on the icon. Sessions end on their own after 90 minutes idle. The card appears once per drift, and Escape snoozes it. Requires Chrome 140.
```
