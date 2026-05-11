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
    // Scope is optional but if present, accept package names OR plan-id NN-NN OR '*'
    'scope-enum': [
      1, // warn, not error — until all phase NN-NN scopes are enumerated
      'always',
      [
        'g2-app',
        'bridge',
        'foundry-module',
        'shared-protocol',
        'shared-render',
        'validation-harness',
        'foundry-mcp',
        '*',
      ],
    ],
    'subject-case': [0], // disable case enforcement (Italian commits allowed)
  },
};
