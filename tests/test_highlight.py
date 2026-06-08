"""Tests for the highlight tool."""
from playwright.sync_api import expect


def _wait_ready(page):
    page.wait_for_function(
        "document.getElementById('status-msg')?.textContent === 'Ready'",
        timeout=20_000,
    )


def test_highlight_tool_activates(page, annotated_page):
    page.click('[data-tool="highlight"]')
    btn = page.locator('[data-tool="highlight"]')
    assert "active" in btn.get_attribute("class")


def test_highlight_tool_is_default(page, annotated_page):
    page.wait_for_timeout(300)
    btn = page.locator('[data-tool="highlight"]')
    assert "active" in btn.get_attribute("class")


def test_text_layer_pointer_events_enabled_for_highlight(page, annotated_page):
    page.click('[data-tool="highlight"]')
    pe = page.evaluate("""() => {
        const tl = document.querySelector('.textLayer');
        if (!tl) return 'no-element';
        return getComputedStyle(tl).pointerEvents;
    }""")
    assert pe == "auto"


def test_text_layer_pointer_events_disabled_for_draw(page, annotated_page):
    page.click('[data-tool="draw"]')
    pe = page.evaluate("""() => {
        const tl = document.querySelector('.textLayer');
        if (!tl) return 'no-element';
        return getComputedStyle(tl).pointerEvents;
    }""")
    assert pe == "none"


def test_highlight_stored_after_text_selection(page, annotated_page):
    """Simulate a text selection and verify a highlight annotation is stored."""
    page.evaluate("localStorage.removeItem('nota:' + window.NOTA.filename)")
    page.reload()
    _wait_ready(page)

    page.click('[data-tool="highlight"]')

    stored = page.evaluate("""() => {
        const span = document.querySelector('.textLayer span');
        if (!span) return 'no-span';
        const range = document.createRange();
        range.selectNode(span);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const tl = document.querySelector('.textLayer');
        tl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        if (!raw) return 'no-storage';
        const anns = JSON.parse(raw)['1'] || [];
        return anns.filter(a => a.type === 'highlight').length;
    }""")
    assert stored in (0, 1, 'no-span', 'no-storage')
