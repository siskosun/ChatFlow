# S6 experiment option audit

The supplied code review identified two independent switches: side-panel `cfPreferences.experiments` merely showed an entry, while the experiment page's `chatflow_experiments_enabled_v1` separately opted into functionality. They were not a synchronized feature flag: the first was only a UI visibility gate, the second is the backend permission. Synchronizing both would implicitly broaden authorization by opening the UI preference; this patch instead removes only the redundant visibility preference and leaves the experiment page's explicit opt-in authoritative.

The entry remains in the collapsed “更多设置” section rather than the homepage main two actions. Legacy visibility preferences are ignored, not migrated into enabled state. The action never sends, retries, forks or uploads until the user uses the experiment workflow. Exact-head tests and browser visual regression are required; no real-account or user acceptance is claimed.
