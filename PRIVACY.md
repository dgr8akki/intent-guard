# Privacy policy

_Last updated: 27 September 2026_

Intent Guard is a Chrome extension that nudges you when you drift away from a task you set. It has no servers, accounts or analytics of its own.

## What is processed, and where

| Data                                                                                                                                             | Where it goes                                                                                                                                                                     | Why                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| The task you type, and for each page you view during a session: its origin and path, title, and up to 800 characters of heading and opening text | The provider you pick in settings: [TypeSafe](https://typesafe.ai) directly, or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which forwards it to TypeSafe to run Jev | Judging whether it's on task |
| The session (task, start time, allowed sites, when you last went off task, last on-task URL)                                                     | `chrome.storage.local` in this browser                                                                                                                                            | Keeping the drift clock      |
| Your API key and chosen provider                                                                                                                 | `chrome.storage.local` in this browser only, readable only by the extension's own pages                                                                                           | Authenticating requests      |

Nothing is sent when no session is running. Intent Guard never sends query strings, URL fragments, form contents, cookies, or content from embedded frames. Judgments are cached in memory only and are lost when Chrome restarts.

Requests are billed to your own TypeSafe or Vercel account and are subject to the privacy policies of TypeSafe and, if you use it, [Vercel](https://vercel.com/legal/privacy-policy).

## Permissions

- **Content script on all http and https pages**: to read the page title and opening text during a session and show the nudge.
- **Access to `api.typesafe.ai` and `ai-gateway.vercel.sh`**: to send that page summary for judging, to whichever of the two you picked. Nothing is sent to the other.
- **`storage`**: to keep your API key and session.
- **One font file readable by web pages** (`fonts/source-serif-4.woff2`): so the nudge card can use the same typeface as the popup. Chrome requires this to be declared as a web-accessible resource. A side effect is that a website could detect that Intent Guard is installed by trying to load that file; it reveals nothing else, and no data is sent anywhere.

## Your choices

End the session in the popup to stop all judging. Disable or remove the extension to delete your key and session.

## Contact

Questions: open an issue at [github.com/dgr8akki/intent-guard](https://github.com/dgr8akki/intent-guard/issues).
