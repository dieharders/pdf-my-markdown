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
const darkModeToggle = document.getElementById("darkModeToggle");

let files = [];
let darkMode = false;

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"];

function isImageFile(name) {
  return IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

function isMdFile(name) {
  return name.toLowerCase().endsWith(".md");
}

function isAcceptedFile(name) {
  return isMdFile(name) || isImageFile(name);
}

function hasMdFiles() {
  return files.some((f) => isMdFile(f.name));
}

function buildFormData() {
  const formData = new FormData();
  files.forEach((f) => {
    formData.append(isMdFile(f.name) ? "files" : "assets", f);
  });
  formData.append("primaryColor", colorInput.value);
  formData.append("darkMode", String(darkMode));
  return formData;
}

// ---- Theme Color ----

function updateAccentColor(hex) {
  document.documentElement.style.setProperty("--ui-accent", hex);
}

updateAccentColor(colorInput.value);
colorInput.addEventListener("input", (e) => updateAccentColor(e.target.value));

// ---- Dark Mode Toggle ----

darkModeToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  darkModeToggle.setAttribute("aria-checked", String(darkMode));
});

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
    isAcceptedFile(f.name)
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
    const label = isImageFile(f.name) ? '<span class="file-list__badge">image</span> ' : "";
    li.innerHTML = `
      <span class="file-list__name">${label}${escapeHtml(f.name)}</span>
      <button class="file-list__remove" data-index="${i}">&times;</button>
    `;
    fileList.appendChild(li);
  });

  fileList.querySelectorAll(".file-list__remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.index)));
  });

  const hasMd = hasMdFiles();
  previewBtn.disabled = !hasMd;
  convertBtn.disabled = !hasMd;
  clearBtn.hidden = files.length === 0;
  result.hidden = true;
  errorMsg.hidden = true;
}

// ---- Preview ----

previewBtn.addEventListener("click", async () => {
  if (!hasMdFiles()) return;

  previewBtn.disabled = true;
  errorMsg.hidden = true;

  const formData = buildFormData();

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
    previewBtn.disabled = !hasMdFiles();
  }
});

closePreview.addEventListener("click", () => {
  previewOverlay.hidden = true;
  previewFrame.srcdoc = "";
});

// ---- Conversion ----

convertBtn.addEventListener("click", async () => {
  if (!hasMdFiles()) return;

  status.hidden = false;
  result.hidden = true;
  errorMsg.hidden = true;
  convertBtn.disabled = true;

  const formData = buildFormData();

  try {
    const response = await fetch("/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    downloadLink.removeAttribute("href");
    downloadLink.textContent = `Saved to ${data.path}`;
    result.hidden = false;
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.hidden = false;
  } finally {
    status.hidden = true;
    convertBtn.disabled = !hasMdFiles();
  }
});

// ---- Clear ----

clearBtn.addEventListener("click", () => {
  files = [];
  renderFileList();
  result.hidden = true;
  downloadLink.removeAttribute("href");
});
