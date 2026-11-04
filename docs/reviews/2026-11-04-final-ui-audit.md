# Final bounded UI audit

The independent E run at e69e1663 passed its four installed-MV3 heading cases but failed the older Task Loop test before tools opened: a delayed source-picker refresh replaced A with B. This is an actual selection race, not a heading assertion to weaken. Source refresh now has an epoch and reads the live choice after its final asynchronous wait. Two deterministic tests execute the production picker function with reordered responses and preserved same-title sources.

The 320px installed-browser screenshot also showed a generated handoff index labeled as an original attachment and an active confirmation button after user acknowledgement. The index now has its own label and an acknowledged file disables the duplicate acknowledgement action. Browser assertions check both changes. The generated index/history/original bytes and page-observation state remain separate.

The adjacent duplicate source assertion was removed without removing the checks before and after asynchronous capture lookup. Existing data formats, permissions, no-autosend and no-unknown-retry invariants remain unchanged. These changes require a new exact-head full run; the failed E run is retained, not relabeled successful.

## Additional exact-head run observations

Run 41851279559 at cd0e73e4 still failed the Task Loop return-to-A assertion after visiting B, and an index-label assertion. These are not marked accepted. The capture page now re-enumerates sources on entry and tab-navigation changes, instead of relying only on timer/focus. The browser test verifies that both the extension's tab list and its live selector have returned to A before selecting it, and still checks the exact tab ID and URL. This prevents a temporarily stale tab URL from being treated as a correct source.

The handoff-label test now waits until all staged file rows are rendered, checks that the actual first record has kind=index and the exact handoff_index.md name, and then checks the visible localized label. If it fails, the assertion includes file-kind and rendered-row evidence rather than silently accepting a different label. No product upload or success state is relaxed.
