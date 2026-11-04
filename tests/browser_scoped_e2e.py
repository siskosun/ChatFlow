"""Run the retained MV3 suite with an explicitly associated composer fixture.

Only test HTML is adapted: editor, file inputs, Send and chips share one form.
Every original test and assertion in browser_e2e.main is executed unchanged.
The unscoped/ambiguous negative cases are covered separately; there is no
production test-only flag or fallback to the whole document.
"""
import asyncio
import browser_e2e as suite

old = '<textarea id="prompt-textarea"'
assert suite.TARGET_HTML.count(old) == 1
suite.TARGET_HTML = suite.TARGET_HTML.replace(old, '<form id="fixture-composer">' + old, 1)
old_end = '<div id="uploads"></div>'
assert suite.TARGET_HTML.count(old_end) == 1
suite.TARGET_HTML = suite.TARGET_HTML.replace(old_end, old_end + '</form>', 1)
# A form's native default submit must not add a test-site navigation when the
# user explicitly presses the synthetic Send button.
suite.TARGET_HTML = suite.TARGET_HTML.replace('<button id="user-send"', '<button type="button" id="user-send"', 1)

if __name__ == '__main__':
    asyncio.run(suite.main())
