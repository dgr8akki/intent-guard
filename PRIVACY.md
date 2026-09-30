# Privacy policy

_Last updated: 30 September 2026_

Intent Guard is a Chrome extension that nudges you when you drift away from a task you set. It has no servers, accounts or analytics of its own.

## What is processed, and where

| Data                                                                                                                                                                               | Where it goes                                                                                                                                                                     | Why                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| The task you type, and for each page you view during a session, unless it is skipped (see below): its origin and path, title, and up to 800 characters of heading and opening text | The provider you pick in settings: [TypeSafe](https://typesafe.ai) directly, or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which forwards it to TypeSafe to run Jev | Judging whether it's on task |
| The session (task, start time, allowed sites, when you last went off task, last on-task URL)                                                                                       | `chrome.storage.local` in this browser                                                                                                                                            | Keeping the drift clock      |
| Your API key and chosen provider                                                                                                                                                   | `chrome.storage.local` in this browser only, readable only by the extension's own pages                                                                                           | Authenticating requests      |
| Sites you add under **Never send these sites**                                                                                                                                     | `chrome.storage.local` in this browser                                                                                                                                            | Skipping them                |

Nothing is sent when no session is running, and a session ends on its own after 90 minutes without any page being checked, or after 8 hours in any case. Intent Guard never sends query strings, URL fragments, form contents, cookies, or content from embedded frames. Judgments are cached in memory only and are lost when Chrome restarts.

Some pages are skipped even during a session. Mail, banking, government, health and password-manager sites, sign-in pages, any page with a password field and any page marked `noindex` are skipped by default (the list is in [`src/lib/exclusions.js`](src/lib/exclusions.js)), and you can add your own under **Never send these sites** in settings or with **Don't judge this site** in the popup. A skipped page reports only its origin (for example `https://mail.google.com`) to the extension itself, so the drift clock knows a page was viewed; no title or text leaves the browser and the provider is not called. The list errs towards skipping, so a health-news site is skipped too; that costs a nudge, not your privacy.

Requests are billed to your own TypeSafe or Vercel account and are subject to the privacy policies of TypeSafe and, if you use it, [Vercel](https://vercel.com/legal/privacy-policy).

## Permissions

- **Content script on all http and https pages**: to read the page title and opening text during a session and show the nudge.
- **Access to `api.typesafe.ai` and `ai-gateway.vercel.sh`**: to send that page summary for judging, to whichever of the two you picked. Nothing is sent to the other.
- **`storage`**: to keep your API key, session and list of sites never to send.
- **`scripting`**: to add the same content script to tabs that were already open when you installed Intent Guard or started a session, so they are checked too. It runs nothing else.
- **One font file readable by web pages** (`fonts/source-serif-4.woff2`): so the nudge card can use the same typeface as the popup. Chrome requires this to be declared as a web-accessible resource. A side effect is that a website could detect that Intent Guard is installed by trying to load that file; it reveals nothing else, and no data is sent anywhere.

## Your choices

End the session in the popup to stop all judging. Add a site under **Never send these sites** to keep it out of every session. Disable or remove the extension to delete your key, session and list.

## Contact

Questions: open an issue at [github.com/dgr8akki/intent-guard](https://github.com/dgr8akki/intent-guard/issues).
