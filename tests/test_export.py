"""Tests for PDF export."""
from pathlib import Path
from playwright.sync_api import expect


def _add_draw_stroke(page):
    page.click('[data-tool="draw"]')
    canvas = page.locator('[data-page="1"] .annotation-canvas')
    box = canvas.bounding_box()
    x, y = box["x"] + 55, box["y"] + 55
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 80, y + 40)
    page.mouse.up()
    page.wait_for_timeout(300)


def test_export_button_present(page, annotated_page):
    page.goto(annotated_page)
    expect(page.locator("#export-btn")).to_be_visible()


def test_export_triggers_download(page, annotated_page, tmp_path):
    page.goto(annotated_page)
    page.evaluate("localStorage.removeItem('nota:' + window.NOTA.filename)")
    page.reload()
    page.wait_for_selector(".page-container", timeout=20_000)
    page.wait_for_timeout(600)

    _add_draw_stroke(page)

    with page.expect_download(timeout=20_000) as dl_info:
        page.click("#export-btn")

    dl = dl_info.value
    path = tmp_path / "annotated.pdf"
    dl.save_as(path)
    assert path.exists()
    assert path.stat().st_size > 100


def test_exported_file_is_valid_pdf(page, annotated_page, tmp_path):
    page.goto(annotated_page)
    page.evaluate("localStorage.removeItem('nota:' + window.NOTA.filename)")
    page.reload()
    page.wait_for_selector(".page-container", timeout=20_000)
    page.wait_for_timeout(600)

    _add_draw_stroke(page)

    with page.expect_download(timeout=20_000) as dl_info:
        page.click("#export-btn")

    dl = dl_info.value
    path = tmp_path / "out.pdf"
    dl.save_as(path)

    from pypdf import PdfReader
    reader = PdfReader(path)
    assert len(reader.pages) >= 1


def test_exported_filename_contains_annotated(page, annotated_page, tmp_path):
    page.goto(annotated_page)
    _add_draw_stroke(page)

    with page.expect_download(timeout=20_000) as dl_info:
        page.click("#export-btn")

    dl = dl_info.value
    assert "annotated" in dl.suggested_filename
