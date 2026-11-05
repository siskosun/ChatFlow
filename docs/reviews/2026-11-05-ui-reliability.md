# UI/source recovery review — M1/M3/M8/M9/M11/M15/M16/M17/M22/M23

- M1: Success notices clear after a bounded interval. Errors persist with keyboard-operable close controls and never dump untrusted error text to diagnostics.
- M3: Modified handoff input hides the stale Open Target action immediately and re-renders status upon view re-entry.
- M8: A tab already activated is not reported as a total failure if focusing the browser window separately fails; results distinguish tab and window focus.
- M9: Known injection failures are mapped to stable non-sensitive error codes.
- M11: Initialization isolates per-section failures and leaves a visible retry button with partial data intact.
- M15: File batches expand automatically after successful preparation.
- M16: Task source picker does not inherit the separate archive source picker selection.
- M17: Source, file-scope and live-mode changes have distinguishable errors.
- M22: Cleanup never revokes a live in-progress download merely because 15 minutes elapsed.
- M23: Clear the nested aria-live markup, initialize the home aria-current state and avoid hiding default tools during preference loading.

M12 focus-preservation is separately reviewed: blindly restoring focus by row ordinal risks selecting another person's file/task. Exact-head Node, installed browser and cross-platform verification remain required. No real-account or independent human validation is claimed.
