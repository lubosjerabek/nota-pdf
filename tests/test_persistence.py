"""Tests that annotations survive a page reload (localStorage persistence)."""
from playwright.sync_api import expect


def test_draw_persists_after_reload(page, annotated_page):
    page.goto(annotated_page)
    page.evaluate("localStorage.removeItem('nota:' + window.NOTA.filename)")
    page.reload()
    page.wait_for_selector(".page-container", timeout=20_000)

    # Add a draw stroke
    page.click('[data-tool="draw"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    box = canvas.bounding_box()
    x, y = box["x"] + 70, box["y"] + 70
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 90, y + 50)
    page.mouse.up()
    page.wait_for_timeout(300)

    count_before = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        return (JSON.parse(raw || '{}')['1'] || []).length;
    }""")
    assert count_before >= 1

    # Reload and check annotation canvas is re-drawn (state still in localStorage)
    page.reload()
    page.wait_for_selector(".page-container", timeout=20_000)
    page.wait_for_timeout(800)

    count_after = page.evaluate("""() => {
        const raw = localStorage.getItem('nota:' + window.NOTA.filename);
        return (JSON.parse(raw || '{}')['1'] || []).length;
    }""")
    assert count_after == count_before


def test_different_docs_have_separate_state(page, server_url, sample_pdf, tmp_path):
    # Upload the same PDF twice → different filenames → independent state
    page.goto(server_url)
    page.set_input_files("#file-input", str(sample_pdf))
    page.click("#open-btn")
    page.wait_for_selector(".page-container", timeout=20_000)
    url1 = page.url

    page.goto(server_url)
    page.set_input_files("#file-input", str(sample_pdf))
    page.click("#open-btn")
    page.wait_for_selector(".page-container", timeout=20_000)
    url2 = page.url

    # The two URLs should reference different filenames
    assert url1 != url2

    file1 = url1.split("file=")[1]
    file2 = url2.split("file=")[1]
    assert file1 != file2
