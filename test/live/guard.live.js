// Live check against the real Jev model: judges task/page pairs I have actually typed and
// checks the verdicts. Needs a key in .env (see .env.example); not part of npm test or CI.
//
//   npm run eval
//
// TypeSafe rate-limits bursts and has brief outages, so each case waits and retries.
import { createJevClient } from '../../src/lib/jev.js';
import { QUESTIONS, describePage, toVerdict } from '../../src/lib/guard.js';

const MAX_ATTEMPTS = 6;

// [expected verdict, task, page]
const samples = [
  [
    'on',
    'Renew the car insurance before Friday',
    {
      url: 'https://www.axa.ie/car-insurance/renew',
      title: 'Renew your car insurance online | AXA Ireland',
      text: 'Renew your car insurance. Enter your policy number and date of birth to see your renewal quote. Pay in full or monthly.',
    },
  ],
  [
    'off',
    'Renew the car insurance before Friday',
    {
      url: 'https://www.youtube.com/shorts/Xk2',
      title: 'dog refuses to get out of the car #shorts - YouTube',
      text: 'dog refuses to get out of the car #shorts 1.4M views. Subscribe. Comments 3.1K',
    },
  ],
  [
    'on',
    'Work out why the Postgres migration flakes in CI',
    {
      url: 'https://stackoverflow.com/questions/1234/postgres-advisory-lock-released-early',
      title: 'Postgres advisory lock released early during migration - Stack Overflow',
      text: 'My migration takes pg_advisory_lock but a second CI job acquires it before the first finishes. Answer: session-level locks are released when the connection closes; your pooler recycles connections.',
    },
  ],
  [
    'off',
    'Work out why the Postgres migration flakes in CI',
    {
      url: 'https://www.reddit.com/r/all',
      title: 'Reddit - Dive into anything',
      text: 'Popular posts. TIL octopuses have three hearts. My neighbour built a treehouse. [Serious] What is the best pizza topping? 42.1k upvotes.',
    },
  ],
  [
    // A Postgres headline on a news front page is still the news, not the bug.
    'off',
    'Work out why the Postgres migration flakes in CI',
    {
      url: 'https://news.ycombinator.com/',
      title: 'Hacker News',
      text: '1. Show HN: A Postgres extension for vector search 2. Why I left Google 3. The history of the spreadsheet',
    },
  ],
  [
    // Loosely related is still off task; this is the case the whole extension exists for. "It's part of it" allows the site.
    'off',
    'Plan the Lisbon trip for the October bank holiday',
    {
      url: 'https://en.wikipedia.org/wiki/History_of_Lisbon',
      title: 'History of Lisbon - Wikipedia',
      text: 'Lisbon is one of the oldest cities in Western Europe, predating Rome, London and Paris. Phoenician traders, Roman Olisipo, Moorish rule, the 1755 earthquake.',
    },
  ],
  [
    'on',
    'Plan the Lisbon trip for the October bank holiday',
    {
      url: 'https://www.ryanair.com/ie/en/trip/flights/select',
      title: 'Select flights Dublin to Lisbon | Ryanair',
      text: 'Dublin (DUB) to Lisbon (LIS). Fri 24 Oct 06:35, from EUR 39.99. Return Mon 27 Oct 21:10. Choose your fare.',
    },
  ],
  [
    'off',
    "Write up the incident review for last night's outage",
    {
      url: 'https://www.amazon.co.uk/dp/B0CX',
      title: 'Sony WH-1000XM6 Wireless Headphones : Amazon.co.uk: Electronics',
      text: 'Sony WH-1000XM6. GBP 299. Industry-leading noise cancellation. Add to Basket. Buy Now. Customers also bought.',
    },
  ],
  [
    'on',
    "Write up the incident review for last night's outage",
    {
      url: 'https://docs.google.com/document/d/abc/edit',
      title: 'Incident review 2026-09-29: checkout latency - Google Docs',
      text: 'Summary: p99 checkout latency rose to 9 s for 41 minutes after the 22:10 deploy. Timeline. Contributing factors. Action items.',
    },
  ],
];

// TYPESAFE_API_KEY calls TypeSafe directly; otherwise AI_GATEWAY_API_KEY goes through Vercel.
const provider = process.env.TYPESAFE_API_KEY ? 'typesafe' : 'vercel';
const key = process.env.TYPESAFE_API_KEY || process.env.AI_GATEWAY_API_KEY;
if (!key) {
  console.error('Set TYPESAFE_API_KEY or AI_GATEWAY_API_KEY (see .env.example) to run the live evaluation.');
  process.exit(1);
}
console.log(`Provider: ${provider}\n`);
const jev = createJevClient({ getKey: () => key, getProvider: () => provider });

/** Runs `fn`, waiting out rate limits and outages; other errors fail the case. */
async function withRetry(fn) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      // Rate limits and TypeSafe outages are infrastructure, not wrong answers: wait and retry.
      const outage = error.status >= 500;
      if (!(error.busy || outage) || attempt === MAX_ATTEMPTS) throw error;
      const wait = error.retryAfter || 5 * attempt;
      process.stdout.write(`  (${outage ? 'service unavailable' : 'rate-limited'}, waiting ${wait}s)\n`);
      await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
    }
  }
}

let failures = 0;
for (const [expected, intent, page] of samples) {
  const name = `${intent.slice(0, 28)} ← ${page.title.slice(0, 30)}`;
  try {
    const answers = await withRetry(() => jev.evaluate({ state: describePage(intent, page), questions: QUESTIONS }));
    const { verdict, on } = toVerdict(answers);
    const ok = verdict === expected;
    failures += ok ? 0 : 1;
    console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(62)} ${verdict} (on task ${Math.round(on * 100)}%)`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name.padEnd(62)} ${error.message}`);
  }
}

console.log(failures ? `\n${failures} failed` : `\nAll ${samples.length} passed`);
process.exit(failures ? 1 : 0);
