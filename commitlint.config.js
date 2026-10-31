// Source: commitlint.js.org/guides/getting-started (verified 2026-05-11)
// Node 24 requires .mjs OR "type":"module" in package.json — root has "type":"module" so .js works
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'test', 'refactor', 'perf', 'style', 'ci'],
    ],
    // Scope is optional; if present: a package, a repo-wide area, or '*'
    'scope-enum': [
      2,
      'always',
      [
        'g2-app',
        'foundry-module',
        'shared-protocol',
        'shared-render',
        'validation-harness',
        'e2e',
        'relay',
        'release',
        'ci',
        'docs',
        'constitution',
        '*',
      ],
    ],
    'subject-case': [0], // disable case enforcement (Italian commits allowed)
  },
};
