"""Tests for the text note tool."""
from playwright.sync_api import expect


def _wait_ready(page):
    page.wait_for_function(
        "document.getElementById('status-msg')?.textContent === 'Ready'",
        timeout=20_000,
    )


def _clear_state(page):
    page.evaluate("localStorage.removeItem('nota:' + window.NOTA.filename)")


def test_text_tool_activates(page, annotated_page):
    page.click('[data-tool="text"]')
    btn = page.locator('[data-tool="text"]')
    assert "active" in btn.get_attribute("class")


def test_click_places_textarea(page, annotated_page):
    _clear_state(page)
    page.reload()
    _wait_ready(page)

    page.click('[data-tool="text"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    canvas.click(position={"x": 80, "y": 80})

    expect(page.locator(".note-editor").first).to_be_visible()


def test_text_note_committed_on_blur(page, annotated_page):
    _clear_state(page)
    page.reload()
    _wait_ready(page)

    page.click('[data-tool="text"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    canvas.click(position={"x": 100, "y": 120})
    ta = page.locator(".note-editor").first
    ta.type("Test annotation note")
    ta.press("Tab")  # blur

    page.wait_for_timeout(400)
    annotations = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        if (!raw) return [];
        return (JSON.parse(raw)['1'] || []).filter(a => a.type === 'text');
    }""")
    assert any(a["text"] == "Test annotation note" for a in annotations)


def test_text_note_visible_as_div(page, annotated_page):
    _clear_state(page)
    page.reload()
    _wait_ready(page)

    page.click('[data-tool="text"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    canvas.click(position={"x": 110, "y": 130})
    ta = page.locator(".note-editor").first
    ta.type("Visible note")
    ta.press("Enter")

    page.wait_for_timeout(400)
    expect(page.locator(".note-body").first).to_be_visible()
