const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const convertBtn = document.getElementById("convertBtn");
const clearBtn = document.getElementById("clearBtn");
const status = document.getElementById("status");
const result = document.getElementById("result");
const downloadLink = document.getElementById("downloadLink");
const errorMsg = document.getElementById("errorMsg");
const colorInput = document.getElementById("colorInput");
const previewBtn = document.getElementById("previewBtn");
const previewOverlay = document.getElementById("previewOverlay");
const previewFrame = document.getElementById("previewFrame");
const closePreview = document.getElementById("closePreview");

let files = [];

// ---- Theme Color ----

function updateAccentColor(hex) {
  document.documentElement.style.setProperty("--ui-accent", hex);
}

updateAccentColor(colorInput.value);
colorInput.addEventListener("input", (e) => updateAccentColor(e.target.value));

// ---- Drop Zone Events ----

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drop-zone--active");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drop-zone--active");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drop-zone--active");
  const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
    f.name.toLowerCase().endsWith(".md")
  );
  addFiles(droppedFiles);
});

fileInput.addEventListener("change", () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = "";
});

// ---- File Management ----

function addFiles(newFiles) {
  for (const f of newFiles) {
    if (!files.some((existing) => existing.name === f.name)) {
      files.push(f);
    }
  }
  renderFileList();
}

function removeFile(index) {
  files.splice(index, 1);
  renderFileList();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderFileList() {
  fileList.innerHTML = "";
  files.forEach((f, i) => {
    const li = document.createElement("li");
    li.className = "file-list__item";
    li.innerHTML = `
      <span class="file-list__name">${escapeHtml(f.name)}</span>
      <button class="file-list__remove" data-index="${i}">&times;</button>
    `;
    fileList.appendChild(li);
  });

  fileList.querySelectorAll(".file-list__remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.index)));
  });

  previewBtn.disabled = files.length === 0;
  convertBtn.disabled = files.length === 0;
  clearBtn.hidden = files.length === 0;
  result.hidden = true;
  errorMsg.hidden = true;
}

// ---- Preview ----

previewBtn.addEventListener("click", async () => {
  if (files.length === 0) return;

  previewBtn.disabled = true;
  errorMsg.hidden = true;

  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  formData.append("primaryColor", colorInput.value);

  try {
    const response = await fetch("/preview", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.status}`);
    }

    const html = await response.text();
    previewFrame.srcdoc = html;
    previewOverlay.hidden = false;
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.hidden = false;
  } finally {
    previewBtn.disabled = files.length === 0;
  }
});

closePreview.addEventListener("click", () => {
  previewOverlay.hidden = true;
  previewFrame.srcdoc = "";
});

// ---- Conversion ----

convertBtn.addEventListener("click", async () => {
  if (files.length === 0) return;

  status.hidden = false;
  result.hidden = true;
  errorMsg.hidden = true;
  convertBtn.disabled = true;

  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  formData.append("primaryColor", colorInput.value);

  try {
    const response = await fetch("/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    // Revoke previous blob URL
    if (downloadLink.href.startsWith("blob:")) {
      URL.revokeObjectURL(downloadLink.href);
    }

    downloadLink.href = url;
    downloadLink.download = files[0].name.replace(/\.md$/i, "") + ".pdf";
    result.hidden = false;
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.hidden = false;
  } finally {
    status.hidden = true;
    convertBtn.disabled = files.length === 0;
  }
});

// ---- Clear ----

clearBtn.addEventListener("click", () => {
  files = [];
  renderFileList();
  result.hidden = true;
  if (downloadLink.href.startsWith("blob:")) {
    URL.revokeObjectURL(downloadLink.href);
  }
});
