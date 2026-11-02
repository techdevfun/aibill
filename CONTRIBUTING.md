# Contributing

Bug reports with a **redacted** transcript snippet are the most useful thing you
can send: the money math lives or dies on real-world formats. Strip proprietary
code and secrets first - maintainers cannot use anything you should not have sent.

## Ground rules

- PRs need tests. `npm test` must be green and `npx tsc --noEmit` clean.
- No new runtime dependencies without a written reason in the PR.
- New transcript adapters must fail loudly on foreign formats, never guess.
- USD math stays honest: estimates from dated rate cards, unknown models at $0
  and flagged, `diff` reports measured change only.

## Local dev

```sh
npm install
npm run build
npm test
node out/src/cli.js scan examples/session-before.jsonl
```
