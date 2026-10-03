/**
 * commitlint configuration — enforces Conventional Commits (issue #153, AC-1).
 *
 * Marked `.cjs` on purpose: package.json sets `"type": "module"`, so a plain
 * `.js` file would be parsed as ESM and `module.exports` would fail to load.
 *
 * Base preset: @commitlint/config-conventional (type-enum, subject rules, ...),
 * which keeps `defaultIgnores: true`.
 *
 * `ignores` — see design doc §5.3. Entries MUST be functions: commitlint's
 * config validator rejects RegExp/string values with
 * `"/ignores/0" should be a function`.
 *
 * Only patterns that can actually match a real message are listed. The earlier
 * `/^\[dependabot/` draft was removed: real dependabot PR titles read
 * `Bump X from Y to Z`, so that regex could never fire (misleading protection).
 * The durable safeguard for bots is configuration (`commit-message.prefix`) if
 * dependabot is ever enabled — not these fallbacks.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    (message) => /^Merge /.test(message),
    (message) => /^Revert /.test(message),
    (message) => /^chore\(release\):/.test(message),
    (message) => /^Merge pull request/.test(message),
    // dependabot default title format (verified: not present in this repo yet)
    (message) => /^Bump /.test(message),
    // format produced once `commit-message.prefix: "chore(deps)"` is configured
    (message) => /^chore\(deps\)/.test(message),
  ],
};
