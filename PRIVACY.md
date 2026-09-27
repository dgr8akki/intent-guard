# Privacy policy

_Last updated: 27 September 2026_

Intent Guard is a Chrome extension that nudges you when you drift away from a task you set. It has no servers, accounts or analytics of its own.

## What is processed, and where

| Data                                                                                                                                             | Where it goes                                                                                                            | Why                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| The task you type, and for each page you view during a session: its origin and path, title, and up to 800 characters of heading and opening text | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which forwards it to [TypeSafe](https://typesafe.ai) to run Jev | Judging whether it's on task |
| The session (task, start time, allowed sites, when you last went off task, last on-task URL)                                                     | `chrome.storage.local` in this browser                                                                                   | Keeping the drift clock      |
| Your AI Gateway API key                                                                                                                          | `chrome.storage.local` in this browser only, readable only by the extension's own pages                                  | Authenticating requests      |

Nothing is sent when no session is running. Intent Guard never sends query strings, URL fragments, form contents, cookies, or content from embedded frames. Judgments are cached in memory only and are lost when Chrome restarts.

Requests to AI Gateway are billed to your own Vercel account and are subject to the privacy policies of [Vercel](https://vercel.com/legal/privacy-policy) and TypeSafe.

## Permissions

- **Content script on all http and https pages**: to read the page title and opening text during a session and show the nudge.
- **Access to `ai-gateway.vercel.sh`**: to send that page summary for judging.
- **`storage`**: to keep your API key and session.

## Your choices

End the session in the popup to stop all judging. Disable or remove the extension to delete your key and session.

## Contact

Questions: open an issue at [github.com/dgr8akki/intent-guard](https://github.com/dgr8akki/intent-guard/issues).
