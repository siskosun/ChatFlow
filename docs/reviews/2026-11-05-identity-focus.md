# Identity-bound keyboard focus audit (M12)

After refreshing an archive list, passage list, task list or experiment list, focus may be lost because DOM nodes are replaced. This increment restores focus only to the same stable archive ID plus control role, passage ID plus control role, source message node ID or task/experiment ID; it never falls back to row ordinal or matching titles. Missing/disabled/changed rows do not receive focus. Programmatic scroll position is preserved on restoration.

Positive and negative Node fixtures execute the production archive helper with changed and missing identities. Existing installed MV3 UI QA and keyboard tests must pass at the exact PR head. No real assistive technology or authenticated user acceptance has occurred. Source data, tasks, preferences and original attachments are unchanged.
