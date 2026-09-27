// Live evaluation against the real Jev model: judges hand-written task/page
// pairs and checks the verdicts. Needs AI_GATEWAY_API_KEY (see .env.example); not run in CI.
//
//   npm run eval
//
// TypeSafe rate-limits bursts and has brief outages, so each case waits and retries.
import { createJevClient } from '../src/lib/jev.js';
import { QUESTIONS, describePage, toVerdict } from '../src/lib/guard.js';

const MAX_ATTEMPTS = 6;

// [expected verdict, task, page]
const samples = [
  [
    'on',
    'Compare flights to Goa for December',
    {
      url: 'https://www.google.com/travel/flights',
      title: 'Delhi to Goa | Google Flights',
      text: 'Round trip · 1 passenger · Economy. Delhi → Goa, Dec 20 – Dec 27. Best departing flights: IndiGo 6E 2012 ₹6,450, Air India AI 883 ₹7,120.',
    },
  ],
  [
    'off',
    'Compare flights to Goa for December',
    {
      url: 'https://www.youtube.com/shorts/Xk2',
      title: 'cat tries cucumber 😂 #shorts - YouTube',
      text: 'cat tries cucumber 😂 #shorts 2.1M views. Subscribe. Comments 4.2K',
    },
  ],
  [
    'on',
    'Fix the flaky Postgres migration in our CI',
    {
      url: 'https://stackoverflow.com/questions/1234/postgres-advisory-lock-released-early',
      title: 'Postgres advisory lock released early during migration - Stack Overflow',
      text: 'My migration takes pg_advisory_lock but a second CI job acquires it before the first finishes. Answer: session-level locks are released when the connection closes; your pooler recycles connections.',
    },
  ],
  [
    'off',
    'Fix the flaky Postgres migration in our CI',
    {
      url: 'https://www.reddit.com/r/all',
      title: 'Reddit - Dive into anything',
      text: 'Popular posts. TIL octopuses have three hearts. My neighbour built a treehouse. [Serious] What is the best pizza topping? 42.1k upvotes.',
    },
  ],
  [
    'off',
    'Fix the flaky Postgres migration in our CI',
    {
      url: 'https://news.ycombinator.com/',
      title: 'Hacker News',
      text: '1. Show HN: A Postgres extension for vector search 2. Why I left Google 3. The history of the spreadsheet',
    },
  ],
  [
    // Loosely related counts as drift: rabbit holes are the point. "It's part of it" allows the site.
    'off',
    'Compare flights to Goa for December',
    {
      url: 'https://en.wikipedia.org/wiki/Goa',
      title: 'Goa - Wikipedia',
      text: 'Goa is a state on the southwestern coast of India. Beaches, Portuguese heritage, tourism peaks Nov-Feb.',
    },
  ],
  [
    'off',
    'Write the Q3 board update',
    {
      url: 'https://www.amazon.in/dp/B0CX',
      title: 'Sony WH-1000XM6 Wireless Headphones : Amazon.in: Electronics',
      text: 'Sony WH-1000XM6. ₹29,990. Industry-leading noise cancellation. Add to Cart. Buy Now. Customers also bought.',
    },
  ],
  [
    'on',
    'Write the Q3 board update',
    {
      url: 'https://docs.google.com/document/d/abc/edit',
      title: 'Q3 Board Update - DRAFT - Google Docs',
      text: 'Q3 Board Update. Summary: ARR grew 18% QoQ to $4.2M. Hiring: 3 engineers joined. Risks: enterprise pipeline slipping into Q4.',
    },
  ],
];

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error('Set AI_GATEWAY_API_KEY (see .env.example) to run the live evaluation.');
  process.exit(1);
}
const jev = createJevClient({ getKey: () => process.env.AI_GATEWAY_API_KEY });

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
