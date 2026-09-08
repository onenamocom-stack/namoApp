import globals from 'globals'
import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'
import importX from 'eslint-plugin-import-x'

/**
 * The narrowest linter that closes the trap in docs/04-UI-UX.md §11:
 * `npm run build` is green on an undefined identifier, because Vite transpiles
 * without resolving scope. `<Foo />` where Foo was never imported, or
 * `{answerRate}` after the variable was renamed, is a white screen at runtime
 * and a passing build. Both are caught here, at the cost of one command.
 *
 * It is deliberately NOT a style config. There is no formatter, no import
 * ordering, no opinion about hooks-in-conditions beyond the two rules React
 * cannot recover from. Everything that is merely taste is off, so a red lint
 * always means something is actually broken — the moment it cries wolf it
 * stops being run.
 *
 * `react/prop-types` is off on purpose: screens take no props, and the
 * components that do are internal to this repo. That rule is the reason most
 * React lint setups get deleted.
 */
export default [
  {
    files: ['src/**/*.{js,jsx}', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '18.3' } },
    plugins: { react, 'react-hooks': hooks, 'import-x': importX },
    rules: {
      // The trap itself.
      'no-undef': 'error',

      // The same trap across a module boundary, and the more expensive half:
      // `no-undef` only sees one file, so an import of a name the other module
      // no longer exports is invisible to it AND to `npm run build` — rollup
      // emits no warning for it. It is not a broken screen either, it is a
      // broken APP: the import is evaluated at module load, so one stale name
      // in one screen white-screens every route including onboarding. That
      // shipped here on 7 Sep, when a pricing refactor deleted
      // REPORT_MULTIPLIER and left Reports.jsx importing it.
      'import-x/named': 'error',
      'import-x/no-unresolved': 'error',
      'react/jsx-no-undef': 'error',
      // Without this, an import used only as `<Foo />` reads as unused and
      // the report is 370 false warnings deep — which is how a linter gets
      // ignored and then deleted.
      'react/jsx-uses-vars': 'error',

      // The same class of failure, one step later: a name that exists but is
      // dead, which is what a half-finished rename leaves behind.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // The store's dependency array is hand-maintained (HANDOFF §1). This is
      // the rule that notices when the value object and the array disagree.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Undeclared or duplicated bindings, and unreachable branches.
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
    },
  },
]
