<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nota — PDF Annotator</title>
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <link rel="stylesheet" href="assets/app.css">
</head>
<body class="upload-page">
    <div class="upload-card">
        <h1>Nota</h1>
        <p class="subtitle">Annotate PDFs in your browser</p>

        <?php if (!empty($_GET['error'])): ?>
            <div class="error-msg"><?= htmlspecialchars($_GET['error']) ?></div>
        <?php endif; ?>

        <form id="upload-form" action="upload.php" method="post" enctype="multipart/form-data">
            <div class="drop-zone" id="drop-zone">
                <input type="file" name="pdf" id="file-input" accept=".pdf,application/pdf" required>
                <div class="drop-content">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    <p id="drop-label">Drop a PDF here or <span class="link">browse</span></p>
                    <p id="file-chosen" class="file-chosen hidden"></p>
                </div>
            </div>
            <button type="submit" id="open-btn" disabled>Open PDF</button>
        </form>
    </div>

    <script>
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const dropLabel = document.getElementById('drop-label');
        const fileChosen = document.getElementById('file-chosen');
        const openBtn = document.getElementById('open-btn');

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) assignFile(file);
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) assignFile(fileInput.files[0]);
        });

        function assignFile(file) {
            if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                alert('Please select a PDF file.');
                return;
            }
            // Transfer dropped file to the input via DataTransfer
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            dropLabel.classList.add('hidden');
            fileChosen.textContent = file.name;
            fileChosen.classList.remove('hidden');
            openBtn.disabled = false;
        }
    </script>
</body>
</html>
