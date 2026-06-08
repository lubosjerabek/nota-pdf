# nota-pdf

A browser-based PDF annotation tool. Upload a PDF, highlight text, draw freehand, add text notes, and download the annotated PDF — all without installing anything.

No framework, no build step, no database required. Runs on any PHP 8+ host.

![screenshot placeholder](docs/screenshot.png)

---

## Features

| Feature | Details |
|---|---|
| **Highlight text** | Select text on any page; a coloured highlight is drawn over it |
| **Freehand draw** | Draw lines, arrows, and shapes with the mouse or touch |
| **Text notes** | Click to place a sticky-note–style text label; double-click to edit |
| **Select & delete** | Click any annotation to select it, then press Delete to remove it |
| **Undo / Redo** | Up to 30 undo steps; Ctrl+Z / Ctrl+Y |
| **Export annotated PDF** | Annotations are baked into a downloadable PDF via pdf-lib |
| **Persistence** | Annotations survive page reloads via localStorage; optional server-side save |
| **Keyboard shortcuts** | H · D · T · S to switch tools; Ctrl+Z/Y for undo/redo |

---

## Stack

| Component | Library / tech |
|---|---|
| PDF rendering | [PDF.js 4.x](https://mozilla.github.io/pdf.js/) (ESM build) |
| PDF export | [pdf-lib 1.17](https://pdf-lib.js.org/) |
| Backend | PHP 8+ (zero Composer dependencies) |
| Tests | [Playwright](https://playwright.dev/python/) + [pytest](https://pytest.org/) |

All JavaScript vendor files are pre-built and committed in `assets/vendor/` — no npm, no bundler.

---

## Project structure

```
nota-pdf/
├── index.php               # Landing page — drag-and-drop PDF upload
├── annotate.php            # Annotation interface
├── upload.php              # Handles multipart upload, validates MIME type
├── save.php                # (Optional) Save annotations JSON to server
├── load.php                # (Optional) Load server-saved annotations
├── .htaccess               # Blocks direct HTTP access to uploads/ and annotations/
│
├── assets/
│   ├── app.css             # All styles (upload page + annotation interface)
│   ├── app.js              # Bootstrap — wires modules, calls init()
│   ├── state.js            # Annotation data store + localStorage persistence
│   ├── viewer.js           # PDF.js page rendering and coordinate transforms
│   ├── tools.js            # Annotation tools (highlight, draw, text, select)
│   ├── export.js           # PDF export via pdf-lib
│   └── vendor/
│       ├── pdf.min.mjs         # PDF.js main module
│       ├── pdf.worker.min.mjs  # PDF.js web worker
│       └── pdf-lib.min.js      # pdf-lib
│
├── uploads/                # Uploaded PDFs (gitignored, writable by PHP)
├── annotations/            # Server-saved annotation JSON files (gitignored, writable by PHP)
│
└── tests/
    ├── conftest.py         # pytest fixtures — PHP dev server, Playwright browser
    ├── fixtures/
    │   └── sample.pdf      # Minimal valid PDF used by all tests
    ├── test_upload.py
    ├── test_highlight.py
    ├── test_draw.py
    ├── test_text_note.py
    ├── test_persistence.py
    └── test_export.py
```

---

## Local development

### Requirements

- PHP 8.0+
- Python 3.10+ (for running tests)

### Run

```bash
# Start the PHP built-in server from the project root
php -S localhost:8765 -t .

# Open in browser
open http://localhost:8765
```

### Run tests

```bash
# First-time setup
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium

# Run all 24 tests (starts the PHP server automatically)
.venv/bin/pytest tests/ -v
```

---

## Deployment via FTP

Deployment is automated with GitHub Actions using [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action). It runs on every push to `main`, or on demand via the "Run workflow" button.

### One-time server setup

Before the first deploy, create two writable directories on your server and set appropriate permissions:

```bash
mkdir uploads annotations
chmod 755 uploads annotations
# Or 775 if the web user and your FTP user are in different groups
```

These directories are excluded from FTP deploys (via `.ftp-deploy-ignore`) so their contents are never overwritten by CI.

### GitHub Actions secrets

Add these four secrets in **Settings → Secrets and variables → Actions**:

| Secret | Example value | Description |
|---|---|---|
| `FTP_SERVER` | `ftp.example.com` | FTP hostname (without `ftp://`) |
| `FTP_USERNAME` | `user@example.com` | FTP login |
| `FTP_PASSWORD` | `••••` | FTP password |
| `FTP_SERVER_DIR` | `/public_html/nota/` | Absolute path on the server |

Once secrets are set, push to `main` — the workflow in `.github/workflows/deploy.yml` will upload all files except those listed in `.ftp-deploy-ignore`.

### What is and isn't deployed

**Deployed:** all PHP files, `assets/` (including vendor JS), `.htaccess`

**Not deployed** (see `.ftp-deploy-ignore`):
- `uploads/` and `annotations/` — managed on the server
- `tests/`, `.venv/`, `pytest.ini`, `requirements.txt` — test tooling
- `.git/`, `.github/`, `.gitignore` — version control artefacts

---

## Annotation data model

Annotations are serialised as JSON and stored under the localStorage key `nota:<filename>`. The same structure is used for server-side saves.

```jsonc
{
  "1": [                           // page number (1-based)
    {
      "type": "highlight",
      "id": "lh3k2a4f9",           // compact time-based uid
      "page": 1,
      "rects": [[x, y, w, h]],    // one rect per text line; PDF user-space coords
      "color": "#f5c518"
    },
    {
      "type": "draw",
      "id": "lh3k2b1c0",
      "page": 1,
      "points": [[x1,y1], [x2,y2], ...],  // PDF user-space coords
      "color": "#e74c3c",
      "width": 3
    },
    {
      "type": "text",
      "id": "lh3k2c8d2",
      "page": 1,
      "x": 120, "y": 680,         // PDF user-space anchor (bottom-left)
      "text": "My note",
      "color": "#2c3e50",
      "fontSize": 12
    }
  ]
}
```

All coordinates are in **PDF user-space** (origin at the bottom-left, y increasing upward, units = points at 72 dpi). This makes them scale-independent: they work correctly regardless of the zoom level at which the PDF was viewed.

---

## Security

- Uploaded files are validated by MIME type (PHP `finfo`), not just extension.
- Filenames are sanitised to `[a-zA-Z0-9_-]` and a random 4-byte hex suffix prevents collisions and enumeration.
- `uploads/` and `annotations/` are blocked from direct HTTP access via `.htaccess`.
- `docId` values in `save.php` and `load.php` are validated against the same filename regex.
- There is no authentication — this tool is intended for personal/trusted use. To restrict access, wrap it in HTTP Basic Auth at the server level.
