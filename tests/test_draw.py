"""Tests for the freehand draw tool."""
from playwright.sync_api import expect


def _wait_ready(page):
    page.wait_for_function(
        "document.getElementById('status-msg')?.textContent === 'Ready'",
        timeout=20_000,
    )


def test_draw_tool_activates(page, annotated_page):
    # annotated_page fixture already navigated and waited for Ready
    page.click('[data-tool="draw"]')
    btn = page.locator('[data-tool="draw"]')
    assert "active" in btn.get_attribute("class")


def test_draw_tool_button_has_active_class(page, annotated_page):
    page.click('[data-tool="draw"]')
    btn = page.locator('[data-tool="draw"]')
    assert "active" in btn.get_attribute("class")


def test_freehand_stroke_saved_to_localstorage(page, annotated_page):
    page.click('[data-tool="draw"]')

    canvas = page.locator('[data-page="1"] .annotation-canvas')
    box = canvas.bounding_box()
    x, y = box["x"] + 60, box["y"] + 60

    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 80, y + 40)
    page.mouse.move(x + 120, y + 10)
    page.mouse.up()
    page.wait_for_timeout(300)

    annotations = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data['1'] || [];
    }""")
    assert annotations is not None
    draw_anns = [a for a in annotations if a["type"] == "draw"]
    assert len(draw_anns) >= 1
    assert len(draw_anns[0]["points"]) >= 2


def test_undo_removes_last_draw(page, annotated_page):
    # Clear any existing state and reload
    page.evaluate("localStorage.removeItem('nota:' + window.NOTA.filename)")
    page.reload()
    _wait_ready(page)

    page.click('[data-tool="draw"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    box = canvas.bounding_box()
    x, y = box["x"] + 50, box["y"] + 50

    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 60, y + 30)
    page.mouse.up()
    page.wait_for_timeout(300)

    before_undo = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        if (!raw) return 0;
        return (JSON.parse(raw)['1'] || []).length;
    }""")
    assert before_undo >= 1

    page.keyboard.press("Control+z")
    page.wait_for_timeout(300)

    after_undo = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        if (!raw) return 0;
        return (JSON.parse(raw)['1'] || []).length;
    }""")
    assert after_undo < before_undo
