import os
import subprocess
import time
import socket
import shutil
import pytest
from pathlib import Path
from playwright.sync_api import sync_playwright, Page

ROOT = Path(__file__).parent.parent
FIXTURES = Path(__file__).parent / "fixtures"
HOST = "127.0.0.1"
PORT = 8765
BASE_URL = f"http://{HOST}:{PORT}"


def _port_open(host, port):
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


@pytest.fixture(scope="session")
def php_server():
    """Start PHP built-in dev server for the session."""
    if _port_open(HOST, PORT):
        yield BASE_URL
        return

    proc = subprocess.Popen(
        ["php", "-S", f"{HOST}:{PORT}", "router.php"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for _ in range(20):
        if _port_open(HOST, PORT):
            break
        time.sleep(0.25)
    else:
        proc.terminate()
        raise RuntimeError(f"PHP server did not start on port {PORT}")

    yield BASE_URL
    proc.terminate()


@pytest.fixture(scope="session")
def browser_context(php_server):
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(
            accept_downloads=True,
            viewport={"width": 1280, "height": 900},
        )
        yield ctx
        browser.close()


@pytest.fixture
def page(browser_context):
    p = browser_context.new_page()
    yield p
    p.close()


@pytest.fixture
def server_url(php_server):
    return php_server


@pytest.fixture
def sample_pdf():
    """Path to a small valid PDF bundled with the tests."""
    return FIXTURES / "sample.pdf"


@pytest.fixture
def annotated_page(page, server_url, sample_pdf):
    """Upload sample.pdf, wait for app to be fully ready, return annotate.php URL."""
    page.goto(server_url)
    page.set_input_files("#file-input", str(sample_pdf))
    page.click("#open-btn")
    page.wait_for_selector(".page-container", timeout=20_000)
    # Wait until NotaApp finishes initialising (status bar reads "Ready")
    page.wait_for_function(
        "document.getElementById('status-msg')?.textContent === 'Ready'",
        timeout=20_000,
    )
    return page.url
