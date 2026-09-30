# Privacy policy

_Last updated: 30 September 2026_

Intent Guard is a Chrome extension that shows you a card when you drift away from a task you typed. It has no servers, no accounts and no analytics. The only network traffic it makes is to the provider you chose for the model that judges pages, and that traffic uses your own key.

## What is sent, and to whom

While a session is running, each page you view is judged unless it is skipped (see the next section). For a judged page the extension sends your task, the page's origin and path, its title, and its heading and description, or up to 300 characters of opening text when it has neither. It never sends the query string or fragment of a URL, the contents of forms, cookies, or anything from embedded frames.

That summary goes to the provider you picked in settings: [TypeSafe](https://typesafe.ai) directly, or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which forwards it to TypeSafe to run the Jev model. Your API key travels with every one of those requests as a bearer token, because that is how the provider knows whose account to bill. It goes to that provider and to no one else. Requests are billed to your own account and are subject to TypeSafe's privacy policy and, if you use it, [Vercel's](https://vercel.com/legal/privacy-policy).

Nothing is sent when no session is running. A session ends on its own after 90 minutes without any page being checked, or after 8 hours in any case, so a task you forgot about does not keep judging tomorrow's browsing. A site the model has already judged on task is not asked about again during the session.

## Pages that are never sent

Some pages are skipped even during a session. Webmail, banking, government, health and password-manager sites, and sign-in pages are on a built-in list (it is in [`src/lib/exclusions.js`](src/lib/exclusions.js)). Any page with a password field and any page marked `noindex` is skipped as well. You can add sites of your own under Never send these sites in settings, or with Don't judge this site in the popup.

Because webmail is on that list, the subject and body of an email you have open are not sent. A skipped page reports only its origin (for example `https://mail.google.com`) to the extension itself, so the drift clock knows a page was viewed; no title or text leaves the browser and the provider is not called. The list errs towards skipping: a health-news site is skipped too. That costs you a card, not your privacy.

## What stays in this browser

| Data                                                                                                                                                                                   | Where                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Your API key and chosen provider                                                                                                                                                       | `chrome.storage.local`, readable only by the extension's own pages and its worker, never by web pages |
| The session: task, start time, chosen drift minutes, allowed sites, sites judged on task, when the current off-task stretch began, the last on-task page, when a page last reported in | `chrome.storage.local`, until the session ends                                                        |
| Sites you added under Never send these sites, and whether you have dismissed the note about what is sent                                                                               | `chrome.storage.local`                                                                                |
| The last failed check (its message, status and time), so the popup can tell you the provider is not answering                                                                          | `chrome.storage.local`, cleared by the next successful check or when the session ends                 |
| Judgments already made, so switching tabs does not repeat a request                                                                                                                    | `chrome.storage.session`, cleared when you close the browser                                          |

No history of pages you visited is kept beyond the last on-task page in the session and the judgment cache above.

## Permissions

- Content script on all http and https pages: to read the page heading and description during a session and to show the card.
- Access to `api.typesafe.ai` and `ai-gateway.vercel.sh`: to send the page summary for judging, to whichever of the two you picked. Nothing is sent to the other.
- `storage`: for everything in the table above.
- `scripting`, with host access on all http and https pages: to add the content script to tabs that were already open when you installed Intent Guard or started a session, and to tell open tabs when the session or the never-send list changes. The content script already runs on those pages, so this grants nothing it could not already do.

## Your choices

End the session in the popup to stop all judging. Add a site under Never send these sites to keep it out of every session. Remove the key in settings to stop the extension making any request at all. Disable or remove the extension to delete everything it stored.

## Contact

Email pahujaaakash5@gmail.com, or open an issue at [github.com/dgr8akki/intent-guard](https://github.com/dgr8akki/intent-guard/issues).
