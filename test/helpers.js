/**
 * A Jev client double. `respond` receives the request body and returns the
 * `answers` object (or throws, to simulate errors).
 *
 * @param {(body: any) => Record<string, any>} respond
 */
export function fakeJev(respond) {
  const calls = [];
  return {
    calls,
    async evaluate(body) {
      calls.push(body);
      return respond(body);
    },
  };
}

/** A relevance answer with the given probabilities for levels 0-3. */
export const relevance = (...probabilities) => ({
  relevance: { type: 'score', probabilities: Object.fromEntries(probabilities.map((p, i) => [i, p])) },
});

/**
 * A minimal `fetch` Response double.
 *
 * @param {number} status
 * @param {object} body
 * @param {Record<string, string>} [headers]
 */
export function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}
