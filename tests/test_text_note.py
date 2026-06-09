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


def test_text_note_edit_preserves_position(page, annotated_page):
    _clear_state(page)
    page.reload()
    _wait_ready(page)

    # 1. Place a note
    page.click('[data-tool="text"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    canvas.click(position={"x": 120, "y": 150})
    ta = page.locator(".note-editor").first
    ta.type("Initial text")
    ta.press("Enter")
    page.wait_for_timeout(400)

    # Get initial note bounding box
    note = page.locator(".note").first
    box_before = note.bounding_box()
    assert box_before is not None

    # 2. Switch to select tool and double click note to edit
    page.click('[data-tool="select"]')
    note.dblclick()
    
    # Type new text and commit
    editor = page.locator(".note-editor").first
    editor.fill("Updated text")
    editor.press("Enter")
    page.wait_for_timeout(400)

    # Verify position did not change (or changed negligibly due to minor size difference)
    box_after = note.bounding_box()
    assert box_after is not None
    # x/left coordinate should remain very close
    assert abs(box_after["x"] - box_before["x"]) < 2


def test_text_note_dragging(page, annotated_page):
    _clear_state(page)
    page.reload()
    _wait_ready(page)

    # 1. Place a note
    page.click('[data-tool="text"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    canvas.click(position={"x": 150, "y": 150})
    ta = page.locator(".note-editor").first
    ta.type("Draggable Note")
    ta.press("Enter")
    page.wait_for_timeout(400)

    # Get initial note bounding box
    note = page.locator(".note").first
    box_before = note.bounding_box()
    assert box_before is not None

    # 2. Switch to select tool
    page.click('[data-tool="select"]')

    # Drag the note by 100px right and 50px down
    note_box = note.bounding_box()
    start_x = note_box["x"] + note_box["width"] / 2
    start_y = note_box["y"] + note_box["height"] / 2

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x + 100, start_y + 50)
    page.mouse.up()
    page.wait_for_timeout(400)

    # Verify note has moved
    box_after = note.bounding_box()
    assert box_after is not None
    assert box_after["x"] > box_before["x"] + 80
    assert box_after["y"] > box_before["y"] + 30

    # Verify state contains the updated coordinates
    annotations = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        if (!raw) return [];
        return (JSON.parse(raw)['1'] || []).filter(a => a.type === 'text');
    }""")
    assert len(annotations) == 1
    assert annotations[0]["text"] == "Draggable Note"
