# Development and verification

ChatFlow is a classic-script MV3 extension. There are no npm runtime dependencies.
Node 22+ and Python 3.12+ are used for development checks. Official candidates and
acceptance evidence are produced in GitHub Actions, not on the owner's computer.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:performance
python build.py
```

`check` parses the shipped JavaScript and checks the explicit dependency ordering
of the service worker, content scripts, workspaces and optional tools. It is a
narrow load-order/syntax gate, not ESLint, a type checker or a browser acceptance
substitute. Add requirements there when adding a global dependency. Keep new code
readable and document cross-context contracts with JSDoc. No whole-repository
format-only changes in behavior PRs.

GitHub CI installs the pinned browser tools. The rollout test loads the actual
MV3 extension and exercises its real worker dependency graph and IndexedDB.
Fixtures contain no real conversations or credentials. Older tests keep their
assertions; a new source contract requires adding a truthful fixture, not weakening
success conditions. Unknown upload or source evidence must stay unknown.

Use feature branches and reviewable commits. Do not push main, merge automatically,
create a formal Release or submit stores. Existing backup formats remain readable.
IndexedDB v5 is a convergent index repair for v1-v4, not a data-model replacement.
Before downgrading to code that only opens v4, export the current data: the older
runtime cannot open a newer IndexedDB version.

The Checkpoint JSON is the progress source of truth. Use the Checkpoint skill's
`tsm.py` for changes and run `v --history`. A test pass cites its exact commit and
run; broad historical labels do not certify newly added behavior. Logged-in account,
real-attachment, independent-user and human assistive-technology acceptance remain
separate, deferred gates.
