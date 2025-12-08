import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

// Tell pdf.js where to find the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Monaco editor workers
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Configure Monaco environment
self.MonacoEnvironment = {
  getWorker: function (workerId, label) {
    return new editorWorker();
  },
};

// Import our modules
import { registerTypstLanguage, updateCustomFonts } from "./typst-language.js";
import { initStorage, saveDocument, getDocument, getAllDocuments, deleteDocument, getMostRecentDocument, saveFile, getFile, getAllFiles, deleteFile, fileToArrayBuffer } from "./storage.js";
import { templates, getTemplate, getTemplateList } from "./templates.js";
import { getSharedContent, hasSharedContent, clearShareParam, copyShareLink, getShareLinkInfo } from "./share.js";
import { icons, getIcon } from "./icons.js";

// =====================
// CONSTANTS
// =====================
const AUTO_SAVE_DELAY = 1000;
const COMPILE_DELAY = 300;
const DEFAULT_ZOOM = 1.0;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.25;

// =====================
// STATE
// =====================
let editor = null;
let compilerWorker = null;
let compileTimer = null;
let saveTimer = null;
let currentFiles = new Map();
let isInitialized = false;
let currentPdfBuffer = null;
let currentZoom = DEFAULT_ZOOM;
let sidebarVisible = true;
let currentPage = 1;
let totalPages = 0;
let compileStatus = "ready"; // ready, compiling, error
let errorMessage = "";
let currentFileName = "main.typ";
let currentDocumentId = null;
let documents = new Map(); // Map of documentId -> {id, name, content, updatedAt}

// Settings
let settings = {
  fontSize: 14,
  wordWrap: "on",
  minimap: false,
  lineNumbers: "on",
  theme: "system",
};

// Editor mode: 'code' or 'visual'
let editorMode = 'code';
let visualEditorContent = '';
let isVisualEditorSyncing = false;

// Auto-compile setting
let autoCompile = true;

// Loaded fonts
let loadedFonts = [];

// =====================
// INITIALIZATION
// =====================
async function init() {
  // Register Typst language for Monaco
  registerTypstLanguage(monaco);

  // Initialize IndexedDB
  try {
    await initStorage();
    console.log("IndexedDB initialized");
  } catch (e) {
    console.warn("IndexedDB not available, running without persistence:", e);
  }

  // Load saved settings
  loadSettings();

  // Apply theme and setup system theme listener
  applyTheme();
  setupSystemThemeListener();

  // Register service worker for offline support
  registerServiceWorker();

  // Initialize compiler worker
  compilerWorker = new Worker(new URL("./compiler-worker.js", import.meta.url), {
    type: "module",
  });

  compilerWorker.onmessage = handleCompilerMessage;
  compilerWorker.onerror = (e) => {
    console.error("[Main] Worker error:", e);
    setCompileStatus("error", "Compiler worker error: " + (e.message || e));
  };

  // Get initial content
  const initialContent = await getInitialContent();

  // Setup UI
  setupUI();

  // Determine initial Monaco theme
  const initialTheme = settings.theme === "system" ? getSystemTheme() : settings.theme;
  const monacoTheme = initialTheme === "dark" ? "typst-dark" : "typst-light";

  // Create editor
  editor = monaco.editor.create(document.getElementById("monaco-editor"), {
    value: initialContent,
    language: "typst",
    theme: monacoTheme,
    automaticLayout: true,
    minimap: { enabled: settings.minimap },
    fontSize: settings.fontSize,
    lineNumbers: settings.lineNumbers,
    wordWrap: settings.wordWrap,
    scrollBeyondLastLine: false,
    padding: { top: 16 },
    renderLineHighlight: "line",
    cursorBlinking: "smooth",
    smoothScrolling: true,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
    fontLigatures: true,
  });

  // Setup event listeners
  editor.getModel().onDidChangeContent(() => {
    if (autoCompile) {
      clearTimeout(compileTimer);
      compileTimer = setTimeout(() => compile(editor.getValue()), COMPILE_DELAY);
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => autoSave(), AUTO_SAVE_DELAY);
  });

  // Track cursor position
  editor.onDidChangeCursorPosition((e) => {
    updateCursorPosition(e.position);
  });

  // Load uploaded files into virtual filesystem
  await loadFilesIntoVFS();
  
  // Preload sample assets (images for templates)
  await preloadSampleAssets();
  
  // Load saved fonts
  await loadSavedFonts();

  // Initial compile
  compile(editor.getValue());

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  isInitialized = true;
}

// =====================
// CONTENT LOADING
// =====================
async function loadAllDocuments() {
  try {
    const allDocs = await getAllDocuments();
    documents.clear();
    for (const doc of allDocs) {
      documents.set(doc.id, doc);
    }
    console.log(`Loaded ${documents.size} documents`);
  } catch (e) {
    console.warn("Failed to load documents:", e);
  }
}

async function getInitialContent() {
  // Load all documents first
  await loadAllDocuments();
  
  if (hasSharedContent()) {
    const content = getSharedContent();
    if (content) {
      clearShareParam();
      // Create a new document for shared content
      currentDocumentId = generateDocumentId();
      currentFileName = "shared.typ";
      return content;
    }
  }

  try {
    const savedDoc = await getMostRecentDocument();
    if (savedDoc?.content) {
      // Restore saved document
      currentDocumentId = savedDoc.id;
      currentFileName = savedDoc.name || "main.typ";
      return savedDoc.content;
    }
  } catch (e) {
    console.warn("Failed to load saved document:", e);
  }

  // Create default document
  currentDocumentId = generateDocumentId();
  currentFileName = "main.typ";
  
  return `= Welcome to Typst

This is a *live preview* editor for #link("https://typst.app")[Typst].

== Features
- Real-time PDF preview
- Syntax highlighting
- File uploads (images, fonts)
- Templates library
- Share via URL
- Export to PDF

== Quick Start
Try editing this document! Changes compile instantly.

=== Math Example
The quadratic formula:
$ x = (-b ± sqrt(b^2 - 4 a c)) / (2 a) $

=== Code Example
\`\`\`rust
fn main() {
    println!("Hello, Typst!");
}
\`\`\`

#lorem(50)
`;
}

// =====================
// SERVICE WORKER
// =====================
function registerServiceWorker() {
  if (import.meta.env.DEV) {
    console.log("Skipping Service Worker in development mode");
    return;
  }
  
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("Service Worker registered:", reg.scope))
      .catch((err) => console.warn("Service Worker registration failed:", err));
  }
}

// =====================
// AUTO SAVE
// =====================
async function autoSave() {
  if (!isInitialized || !currentDocumentId) return;
  try {
    const content = editor.getValue();
    await saveDocument(currentDocumentId, content, currentFileName);
    
    // Update local documents map
    documents.set(currentDocumentId, {
      id: currentDocumentId,
      name: currentFileName,
      content: content,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.warn("Auto-save failed:", e);
  }
}

// =====================
// DOCUMENT ID GENERATION
// =====================
function generateDocumentId() {
  return 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// =====================
// FILE NAME MANAGEMENT
// =====================
function updateFileName(newName) {
  currentFileName = newName;
  
  // Update header document name
  const docName = document.querySelector("#doc-name span");
  if (docName) {
    docName.textContent = newName;
  }
  
  // Update documents map
  if (currentDocumentId && documents.has(currentDocumentId)) {
    const doc = documents.get(currentDocumentId);
    doc.name = newName;
    documents.set(currentDocumentId, doc);
  }
  
  // Re-render file tree to reflect changes
  renderFileTree();
}

// =====================
// MULTI-FILE MANAGEMENT
// =====================
function renderFileTree() {
  const fileTree = document.getElementById("file-tree");
  if (!fileTree) return;
  
  // Sort documents by updatedAt (most recent first)
  const sortedDocs = Array.from(documents.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  
  if (sortedDocs.length === 0) {
    // Show current unsaved document
    fileTree.innerHTML = `
      <div class="file-item active" data-id="${currentDocumentId}">
        <span class="file-icon">${icons.fileTypst}</span>
        <span class="file-name">${currentFileName}</span>
      </div>
    `;
  } else {
    fileTree.innerHTML = sortedDocs.map(doc => `
      <div class="file-item ${doc.id === currentDocumentId ? 'active' : ''}" data-id="${doc.id}">
        <span class="file-icon">${icons.fileTypst}</span>
        <span class="file-name">${doc.name || 'Untitled.typ'}</span>
        <button class="icon-btn small delete-doc-btn" data-doc-id="${doc.id}" title="Delete">
          ${icons.trash}
        </button>
      </div>
    `).join('');
  }
  
  // Add click handlers for switching documents
  fileTree.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-doc-btn')) return; // Don't switch if clicking delete
      const docId = item.dataset.id;
      if (docId && docId !== currentDocumentId) {
        switchDocument(docId);
      }
    });
  });
  
  // Add delete handlers - use event delegation for better reliability
  fileTree.querySelectorAll('.delete-doc-btn').forEach(btn => {
    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const docId = this.getAttribute('data-doc-id');
      if (docId) {
        deleteDocumentHandler(docId);
      }
    };
  });
}

// Check if filename already exists
function isFileNameTaken(fileName, excludeDocId = null) {
  for (const [docId, doc] of documents) {
    if (excludeDocId && docId === excludeDocId) continue;
    if (doc.name && doc.name.toLowerCase() === fileName.toLowerCase()) {
      return true;
    }
  }
  return false;
}

// Generate unique filename
function getUniqueFileName(baseName) {
  if (!isFileNameTaken(baseName)) {
    return baseName;
  }
  
  // Extract name and extension
  const lastDot = baseName.lastIndexOf('.');
  const name = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;
  const ext = lastDot > 0 ? baseName.substring(lastDot) : '.typ';
  
  let counter = 1;
  let newName = `${name}-${counter}${ext}`;
  while (isFileNameTaken(newName)) {
    counter++;
    newName = `${name}-${counter}${ext}`;
  }
  return newName;
}

async function switchDocument(docId) {
  // Save current document first
  if (currentDocumentId && editor) {
    await autoSave();
  }
  
  const doc = documents.get(docId);
  if (!doc) {
    showToast("Document not found");
    return;
  }
  
  // Switch to new document
  currentDocumentId = docId;
  currentFileName = doc.name || 'Untitled.typ';
  
  // Update editor content
  editor.setValue(doc.content || '');
  
  // Update UI
  updateFileName(currentFileName);
  
  // Compile new content
  compile(editor.getValue());
  
  showToast(`Opened "${currentFileName}"`);
}

function deleteDocumentHandler(docId) {
  const doc = documents.get(docId);
  if (!doc) return;
  
  const fileName = doc.name || 'Untitled.typ';
  
  // Show custom confirmation modal
  showConfirmModal(
    "Delete Document",
    `Are you sure you want to delete "${fileName}"?<br><small>This action cannot be undone.</small>`,
    "Delete",
    async () => {
      try {
        await deleteDocument(docId);
        documents.delete(docId);
        
        // If we deleted the current document, switch to another or create new
        if (docId === currentDocumentId) {
          const remainingDocs = Array.from(documents.values());
          if (remainingDocs.length > 0) {
            // Switch to most recent remaining document
            const mostRecent = remainingDocs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
            await switchDocument(mostRecent.id);
          } else {
            // Create a new blank document
            createNewDocument('main.typ');
          }
        } else {
          renderFileTree();
        }
        
        showToast(`Deleted "${fileName}"`);
      } catch (e) {
        console.error("Failed to delete document:", e);
        showToast("Failed to delete document");
      }
    }
  );
}

// Custom confirmation modal
function showConfirmModal(title, message, confirmText, onConfirm) {
  const content = `
    <div class="confirm-modal">
      <p class="confirm-message">${message}</p>
      <div class="confirm-actions">
        <button class="btn" id="confirm-cancel">Cancel</button>
        <button class="btn danger" id="confirm-ok">${confirmText}</button>
      </div>
    </div>
  `;
  
  showModal(title, content);
  
  document.getElementById("confirm-cancel").addEventListener("click", () => {
    closeModal();
  });
  
  document.getElementById("confirm-ok").addEventListener("click", () => {
    closeModal();
    onConfirm();
  });
}

function createNewDocument(fileName) {
  // Save current document first
  if (currentDocumentId && editor && isInitialized) {
    autoSave();
  }
  
  // Ensure unique filename
  const uniqueFileName = getUniqueFileName(fileName);
  
  // Generate new document
  currentDocumentId = generateDocumentId();
  currentFileName = uniqueFileName;
  
  const newDoc = {
    id: currentDocumentId,
    name: currentFileName,
    content: `= New Document\n\nStart writing here...\n`,
    updatedAt: Date.now()
  };
  
  documents.set(currentDocumentId, newDoc);
  
  // Update editor
  if (editor) {
    editor.setValue(newDoc.content);
  }
  
  // Update UI
  updateFileName(currentFileName);
  renderFileTree();
  
  // Save to storage
  autoSave();
  
  // Return actual filename used (in case it was modified for uniqueness)
  return uniqueFileName;
}

// =====================
// COMPILATION
// =====================
function compile(source) {
  setCompileStatus("compiling");

  compilerWorker.postMessage({
    type: "compile",
    source,
    files: Object.fromEntries(currentFiles),
  });
}

function handleCompilerMessage(event) {
  const { type, ok, pdfBuffer, error, diagnostics } = event.data;

  if (type === "compiled") {
    if (!ok) {
      setCompileStatus("error", error, diagnostics || []);
      return;
    }

    if (!pdfBuffer) {
      setCompileStatus("error", "Compilation produced no output", [{
        severity: "error",
        message: "Compilation produced no output",
        file: "/main.typ",
        line: null,
        column: null,
        hint: null,
      }]);
      return;
    }

    // Make a copy for export (pdf.js will detach the buffer it receives)
    currentPdfBuffer = new Uint8Array(pdfBuffer).slice(0);
    // Pass a separate copy to pdf.js for rendering
    renderPDF(new Uint8Array(pdfBuffer));
    setCompileStatus("ready");
  }
}

function setCompileStatus(status, error = "", diagnostics = []) {
  compileStatus = status;
  errorMessage = error;
  updateStatusBar();
  
  const errorWindow = document.getElementById("error-window");
  if (status === "error" && (error || diagnostics.length > 0)) {
    showErrorWindow(error, diagnostics);
  } else {
    if (errorWindow) {
      errorWindow.classList.remove("visible");
    }
  }
}

// =====================
// ERROR WINDOW
// =====================
function showErrorWindow(summary, diagnostics) {
  const errorWindow = document.getElementById("error-window");
  if (!errorWindow) return;
  
  const errorCount = diagnostics.filter(d => d.severity === "error").length;
  const warningCount = diagnostics.filter(d => d.severity === "warning").length;
  
  // Update header with counts
  const headerText = errorWindow.querySelector(".error-window-title");
  if (headerText) {
    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} Error${errorCount > 1 ? 's' : ''}`);
    if (warningCount > 0) parts.push(`${warningCount} Warning${warningCount > 1 ? 's' : ''}`);
    headerText.textContent = parts.length > 0 ? parts.join(', ') : 'Compilation Error';
  }
  
  // Render diagnostics list
  const errorList = errorWindow.querySelector(".error-list");
  if (errorList) {
    errorList.innerHTML = diagnostics.map((d, index) => {
      const severityIcon = d.severity === "warning" ? icons.warning : icons.error;
      const severityClass = d.severity || "error";
      const location = formatErrorLocation(d);
      const hasLocation = d.line !== null;
      
      return `
        <div class="error-item ${severityClass} ${hasLocation ? 'clickable' : ''}" 
             data-index="${index}" 
             data-line="${d.line || ''}" 
             data-column="${d.column || ''}">
          <div class="error-item-header">
            <span class="error-severity-icon ${severityClass}">${severityIcon}</span>
            <span class="error-message">${escapeHtml(d.message)}</span>
          </div>
          ${location ? `<div class="error-location">${escapeHtml(location)}</div>` : ''}
          ${d.hint ? `<div class="error-hint"><span class="hint-label">Hint:</span> ${escapeHtml(d.hint)}</div>` : ''}
        </div>
      `;
    }).join('');
    
    // Add click handlers for navigating to error locations
    errorList.querySelectorAll('.error-item.clickable').forEach(item => {
      item.addEventListener('click', () => {
        const line = parseInt(item.dataset.line);
        const column = parseInt(item.dataset.column) || 1;
        if (!isNaN(line) && editor) {
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: column });
          editor.focus();
        }
      });
    });
  }
  
  errorWindow.classList.add("visible");
}

function formatErrorLocation(diagnostic) {
  if (diagnostic.line === null) return null;
  
  let location = diagnostic.file || "/main.typ";
  location += `:${diagnostic.line}`;
  if (diagnostic.column !== null) {
    location += `:${diagnostic.column}`;
  }
  return location;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleErrorWindow() {
  const errorWindow = document.getElementById("error-window");
  if (errorWindow) {
    errorWindow.classList.toggle("visible");
  }
}

// =====================
// PDF RENDERING
// =====================
async function renderPDF(buffer) {
  const container = document.getElementById("pdf-pages");
  container.innerHTML = "";

  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    totalPages = pdf.numPages;
    updatePageInfo();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentZoom * 1.5 });

      const pageWrapper = document.createElement("div");
      pageWrapper.className = "pdf-page-wrapper";
      pageWrapper.dataset.page = pageNum;

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      pageWrapper.appendChild(canvas);
      container.appendChild(pageWrapper);
    }

    // Setup intersection observer for page tracking
    setupPageTracking();
  } catch (e) {
    console.error("PDF render error:", e);
    setCompileStatus("error", "Failed to render PDF: " + e.message);
  }
}

function setupPageTracking() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          currentPage = parseInt(entry.target.dataset.page);
          updatePageInfo();
        }
      });
    },
    { threshold: 0.5 }
  );

  document.querySelectorAll(".pdf-page-wrapper").forEach((el) => observer.observe(el));
}

function updatePageInfo() {
  const pageInfo = document.getElementById("page-info");
  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  }
}

// =====================
// ZOOM CONTROLS
// =====================
function zoomIn() {
  console.log("Zoom in called, current:", currentZoom);
  if (currentZoom < MAX_ZOOM) {
    currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
    updateZoom();
  }
}

function zoomOut() {
  console.log("Zoom out called, current:", currentZoom);
  if (currentZoom > MIN_ZOOM) {
    currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
    updateZoom();
  }
}

function resetZoom() {
  currentZoom = DEFAULT_ZOOM;
  updateZoom();
}

function fitWidth() {
  const preview = document.getElementById("preview-content");
  const container = document.getElementById("pdf-pages");
  const firstPage = container.querySelector(".pdf-page");
  
  if (firstPage && preview) {
    const availableWidth = preview.clientWidth - 48;
    const pageWidth = firstPage.width / currentZoom / 1.5;
    currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, availableWidth / pageWidth / 1.5));
    updateZoom();
  }
}

function updateZoom() {
  console.log("Updating zoom to:", currentZoom);
  const zoomDisplay = document.getElementById("zoom-level");
  if (zoomDisplay) {
    zoomDisplay.textContent = `${Math.round(currentZoom * 100)}%`;
  }
  
  if (currentPdfBuffer) {
    // Pass a copy since pdf.js detaches the buffer
    renderPDF(new Uint8Array(currentPdfBuffer));
  }
}

// =====================
// FORMATTING
// =====================
function insertFormatting(before, after = "") {
  if (!editor) return;
  
  const selection = editor.getSelection();
  const selectedText = editor.getModel().getValueInRange(selection);
  const newText = before + selectedText + after;
  
  editor.executeEdits("", [{
    range: selection,
    text: newText,
    forceMoveMarkers: true
  }]);
  
  editor.focus();
}

function setupFormattingButtons() {
  // Text formatting
  document.getElementById("fmt-bold").addEventListener("click", () => {
    insertFormatting("*", "*");
  });
  
  document.getElementById("fmt-italic").addEventListener("click", () => {
    insertFormatting("_", "_");
  });
  
  document.getElementById("fmt-underline").addEventListener("click", () => {
    insertFormatting("#underline[", "]");
  });
  
  document.getElementById("fmt-strike").addEventListener("click", () => {
    insertFormatting("#strike[", "]");
  });
  
  // Script formatting
  document.getElementById("fmt-subscript").addEventListener("click", () => {
    insertFormatting("#sub[", "]");
  });
  
  document.getElementById("fmt-superscript").addEventListener("click", () => {
    insertFormatting("#super[", "]");
  });
  
  // Structure formatting
  document.getElementById("fmt-heading").addEventListener("click", () => {
    const position = editor.getPosition();
    const lineContent = editor.getModel().getLineContent(position.lineNumber);
    if (lineContent.startsWith("=")) {
      insertFormatting("=");
    } else {
      editor.executeEdits("", [{
        range: { startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: 1 },
        text: "= ",
        forceMoveMarkers: true
      }]);
    }
    editor.focus();
  });
  
  document.getElementById("fmt-heading2").addEventListener("click", () => {
    const position = editor.getPosition();
    editor.executeEdits("", [{
      range: { startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: 1 },
      text: "== ",
      forceMoveMarkers: true
    }]);
    editor.focus();
  });
  
  document.getElementById("fmt-list").addEventListener("click", () => {
    const position = editor.getPosition();
    editor.executeEdits("", [{
      range: { startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: 1 },
      text: "- ",
      forceMoveMarkers: true
    }]);
    editor.focus();
  });
  
  document.getElementById("fmt-quote").addEventListener("click", () => {
    insertFormatting("#quote[", "]");
  });
  
  // Alignment
  document.getElementById("fmt-align-left").addEventListener("click", () => {
    insertFormatting("#align(left)[", "]");
  });
  
  document.getElementById("fmt-align-center").addEventListener("click", () => {
    insertFormatting("#align(center)[", "]");
  });
  
  document.getElementById("fmt-align-right").addEventListener("click", () => {
    insertFormatting("#align(right)[", "]");
  });
  
  // Insert formatting
  document.getElementById("fmt-link").addEventListener("click", () => {
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    if (selectedText) {
      insertFormatting('#link("', '")[' + selectedText + ']');
    } else {
      insertFormatting('#link("url")[', "text]");
    }
  });
  
  document.getElementById("fmt-image").addEventListener("click", () => {
    insertFormatting('#image("', '", width: 80%)');
  });
  
  document.getElementById("fmt-table").addEventListener("click", () => {
    insertFormatting('#table(\n  columns: (1fr, 1fr),\n  [Header 1], [Header 2],\n  [Cell 1], [Cell 2],\n)', '');
  });
  
  document.getElementById("fmt-code").addEventListener("click", () => {
    insertFormatting("`", "`");
  });
  
  document.getElementById("fmt-codeblock").addEventListener("click", () => {
    insertFormatting('```\n', '\n```');
  });
  
  document.getElementById("fmt-math").addEventListener("click", () => {
    insertFormatting("$", "$");
  });
}

// =====================
// VISUAL EDITOR
// =====================
function switchEditorMode(mode) {
  if (mode === editorMode) return;
  
  editorMode = mode;
  
  const codeEditor = document.getElementById("monaco-editor");
  const visualContainer = document.getElementById("visual-editor-container");
  const btnCode = document.getElementById("btn-mode-code");
  const btnVisual = document.getElementById("btn-mode-visual");
  const modeToggle = document.querySelector(".editor-mode-toggle");
  
  if (mode === 'visual') {
    // Switch to visual mode
    codeEditor.style.display = "none";
    visualContainer.style.display = "flex";
    btnCode.classList.remove("active");
    btnVisual.classList.add("active");
    modeToggle.classList.add("visual-active");
    
    // Convert current code to visual HTML
    const typstCode = editor.getValue();
    updateVisualEditor(typstCode);
    
    showToast("Rich Text Editor");
  } else {
    // Switch to code mode
    codeEditor.style.display = "block";
    visualContainer.style.display = "none";
    btnCode.classList.add("active");
    btnVisual.classList.remove("active");
    modeToggle.classList.remove("visual-active");
    
    // Convert visual HTML back to Typst code
    const visualEditor = document.getElementById("visual-editor");
    const newTypstCode = htmlToTypst(visualEditor);
    
    if (newTypstCode !== editor.getValue()) {
      isVisualEditorSyncing = true;
      editor.setValue(newTypstCode);
      isVisualEditorSyncing = false;
    }
    
    editor.focus();
    showToast("Source Editor");
  }
}

function updateVisualEditor(typstCode) {
  const visualEditor = document.getElementById("visual-editor");
  visualEditor.innerHTML = typstToHtml(typstCode);
  updateVisualLineNumbers();
}

function updateVisualLineNumbers() {
  const visualEditor = document.getElementById("visual-editor");
  const lineNumbersContainer = document.getElementById("visual-line-numbers");
  
  if (!visualEditor || !lineNumbersContainer) return;
  
  // Count the number of child elements (each represents a line)
  const children = visualEditor.children;
  const lineCount = Math.max(children.length, 1);
  
  // Generate line numbers HTML
  let lineNumbersHtml = '';
  for (let i = 1; i <= lineCount; i++) {
    lineNumbersHtml += `<div class="visual-line-number">${i}</div>`;
  }
  
  lineNumbersContainer.innerHTML = lineNumbersHtml;
  
  // Sync scroll position
  visualEditor.addEventListener('scroll', syncLineNumbersScroll);
}

function syncLineNumbersScroll() {
  const visualEditor = document.getElementById("visual-editor");
  const lineNumbersContainer = document.getElementById("visual-line-numbers");
  
  if (lineNumbersContainer && visualEditor) {
    lineNumbersContainer.scrollTop = visualEditor.scrollTop;
  }
}

// Convert Typst markup to HTML for visual editor
function typstToHtml(typst) {
  let html = typst;
  
  // Process line by line for block elements
  const lines = html.split('\n');
  const processedLines = [];
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';
  let inMathBlock = false;
  let mathBlockContent = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Handle code blocks
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3);
        codeBlockContent = [];
        continue;
      } else {
        inCodeBlock = false;
        processedLines.push(`<pre class="visual-code-block" data-lang="${escapeHtml(codeBlockLang)}"><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        continue;
      }
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }
    
    // Handle math blocks ($$...$$)
    if (line.trim().startsWith('$ ') && line.trim().endsWith(' $') && line.trim().length > 4) {
      // Display math block
      const mathContent = line.trim().slice(2, -2).trim();
      processedLines.push(`<div class="visual-math-block" data-math="${escapeHtml(mathContent)}">$ ${escapeHtml(mathContent)} $</div>`);
      continue;
    }
    
    // Headings
    if (line.startsWith('= ')) {
      processedLines.push(`<h1 class="visual-h1" data-level="1">${processInlineTypst(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('== ')) {
      processedLines.push(`<h2 class="visual-h2" data-level="2">${processInlineTypst(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('=== ')) {
      processedLines.push(`<h3 class="visual-h3" data-level="3">${processInlineTypst(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('==== ')) {
      processedLines.push(`<h4 class="visual-h4" data-level="4">${processInlineTypst(line.slice(5))}</h4>`);
      continue;
    }
    
    // List items
    if (line.match(/^- /)) {
      processedLines.push(`<div class="visual-list-item" data-type="bullet"><span class="visual-bullet">•</span>${processInlineTypst(line.slice(2))}</div>`);
      continue;
    }
    if (line.match(/^\+ /)) {
      processedLines.push(`<div class="visual-list-item" data-type="enum"><span class="visual-enum"></span>${processInlineTypst(line.slice(2))}</div>`);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const match = line.match(/^(\d+)\. /);
      processedLines.push(`<div class="visual-list-item" data-type="numbered" data-num="${match[1]}"><span class="visual-num">${match[1]}.</span>${processInlineTypst(line.slice(match[0].length))}</div>`);
      continue;
    }
    
    // Block directives (simplified handling)
    if (line.trim().startsWith('#set ') || line.trim().startsWith('#show ') || line.trim().startsWith('#let ')) {
      processedLines.push(`<div class="visual-directive">${escapeHtml(line)}</div>`);
      continue;
    }
    
    // Figure blocks
    if (line.trim().startsWith('#figure(')) {
      processedLines.push(`<div class="visual-figure">${escapeHtml(line)}</div>`);
      continue;
    }
    
    // Table blocks
    if (line.trim().startsWith('#table(')) {
      processedLines.push(`<div class="visual-table">${escapeHtml(line)}</div>`);
      continue;
    }
    
    // Comments
    if (line.trim().startsWith('//')) {
      processedLines.push(`<div class="visual-comment">${escapeHtml(line)}</div>`);
      continue;
    }
    
    // Empty lines become paragraph breaks
    if (line.trim() === '') {
      processedLines.push('<div class="visual-paragraph-break"></div>');
      continue;
    }
    
    // Regular paragraphs
    processedLines.push(`<p class="visual-paragraph">${processInlineTypst(line)}</p>`);
  }
  
  // Join without extra newlines - the HTML structure provides the spacing
  return processedLines.join('');
}

// Process inline Typst formatting
function processInlineTypst(text) {
  let result = escapeHtml(text);
  
  // Bold *text*
  result = result.replace(/\*([^*]+)\*/g, '<strong class="visual-bold">$1</strong>');
  
  // Italic _text_
  result = result.replace(/_([^_]+)_/g, '<em class="visual-italic">$1</em>');
  
  // Inline code `text`
  result = result.replace(/`([^`]+)`/g, '<code class="visual-inline-code">$1</code>');
  
  // Inline math $text$
  result = result.replace(/\$([^$]+)\$/g, '<span class="visual-inline-math">$$$1$$</span>');
  
  // Links #link("url")[text]
  result = result.replace(/#link\(&quot;([^&]+)&quot;\)\[([^\]]+)\]/g, '<a class="visual-link" href="$1">$2</a>');
  
  // Simple function calls like #lorem(50)
  result = result.replace(/#(\w+)\(([^)]*)\)/g, '<span class="visual-function">#$1($2)</span>');
  
  // Subscript #sub[text]
  result = result.replace(/#sub\[([^\]]+)\]/g, '<sub class="visual-sub">$1</sub>');
  
  // Superscript #super[text]
  result = result.replace(/#super\[([^\]]+)\]/g, '<sup class="visual-super">$1</sup>');
  
  // Underline #underline[text]
  result = result.replace(/#underline\[([^\]]+)\]/g, '<u class="visual-underline">$1</u>');
  
  // Strike #strike[text]
  result = result.replace(/#strike\[([^\]]+)\]/g, '<s class="visual-strike">$1</s>');
  
  // Labels <label>
  result = result.replace(/&lt;(\w+)&gt;/g, '<span class="visual-label">&lt;$1&gt;</span>');
  
  // References @label
  result = result.replace(/@(\w+)/g, '<span class="visual-ref">@$1</span>');
  
  return result;
}

// Convert HTML from visual editor back to Typst
function htmlToTypst(visualEditor) {
  const lines = [];
  
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    
    const tag = node.tagName.toLowerCase();
    const className = node.className || '';
    
    // Handle different element types
    if (className.includes('visual-h1')) {
      return '= ' + processChildren(node);
    }
    if (className.includes('visual-h2')) {
      return '== ' + processChildren(node);
    }
    if (className.includes('visual-h3')) {
      return '=== ' + processChildren(node);
    }
    if (className.includes('visual-h4')) {
      return '==== ' + processChildren(node);
    }
    
    if (className.includes('visual-list-item')) {
      const type = node.dataset.type;
      const content = processChildrenSkipMarker(node);
      if (type === 'bullet') return '- ' + content;
      if (type === 'enum') return '+ ' + content;
      if (type === 'numbered') return node.dataset.num + '. ' + content;
      return '- ' + content;
    }
    
    if (className.includes('visual-code-block')) {
      const lang = node.dataset.lang || '';
      const code = node.querySelector('code');
      return '```' + lang + '\n' + (code ? code.textContent : '') + '\n```';
    }
    
    if (className.includes('visual-math-block')) {
      return '$ ' + (node.dataset.math || node.textContent.replace(/^\$\s*/, '').replace(/\s*\$$/, '')) + ' $';
    }
    
    if (className.includes('visual-directive') || className.includes('visual-figure') || 
        className.includes('visual-table') || className.includes('visual-comment')) {
      return node.textContent;
    }
    
    if (className.includes('visual-paragraph-break')) {
      return '';
    }
    
    if (className.includes('visual-paragraph') || tag === 'p') {
      return processChildren(node);
    }
    
    // Inline elements
    if (className.includes('visual-bold') || tag === 'strong' || tag === 'b') {
      return '*' + processChildren(node) + '*';
    }
    if (className.includes('visual-italic') || tag === 'em' || tag === 'i') {
      return '_' + processChildren(node) + '_';
    }
    if (className.includes('visual-inline-code') || tag === 'code') {
      return '`' + processChildren(node) + '`';
    }
    if (className.includes('visual-inline-math')) {
      const content = node.textContent.replace(/^\$+/, '').replace(/\$+$/, '');
      return '$' + content + '$';
    }
    if (className.includes('visual-link') || tag === 'a') {
      const href = node.getAttribute('href') || '';
      return `#link("${href}")[${processChildren(node)}]`;
    }
    if (className.includes('visual-sub') || tag === 'sub') {
      return '#sub[' + processChildren(node) + ']';
    }
    if (className.includes('visual-super') || tag === 'sup') {
      return '#super[' + processChildren(node) + ']';
    }
    if (className.includes('visual-underline') || tag === 'u') {
      return '#underline[' + processChildren(node) + ']';
    }
    if (className.includes('visual-strike') || tag === 's') {
      return '#strike[' + processChildren(node) + ']';
    }
    if (className.includes('visual-function')) {
      return node.textContent;
    }
    if (className.includes('visual-label')) {
      return node.textContent;
    }
    if (className.includes('visual-ref')) {
      return node.textContent;
    }
    
    // Line breaks
    if (tag === 'br') {
      return '\n';
    }
    
    // Divs and spans - just process children
    if (tag === 'div' || tag === 'span') {
      return processChildren(node);
    }
    
    // Default: process children
    return processChildren(node);
  }
  
  function processChildren(node) {
    let result = '';
    for (const child of node.childNodes) {
      result += processNode(child);
    }
    return result;
  }
  
  function processChildrenSkipMarker(node) {
    let result = '';
    for (const child of node.childNodes) {
      // Skip bullet/enum markers
      if (child.className && (child.className.includes('visual-bullet') || 
          child.className.includes('visual-enum') || child.className.includes('visual-num'))) {
        continue;
      }
      result += processNode(child);
    }
    return result;
  }
  
  // Process each top-level child
  for (const child of visualEditor.childNodes) {
    // Skip whitespace-only text nodes between elements
    if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) {
      continue;
    }
    const line = processNode(child);
    // Only add non-null lines (paragraph breaks return empty string for blank lines)
    if (line !== null) {
      lines.push(line);
    }
  }
  
  // Clean up multiple consecutive empty lines
  const cleanedLines = [];
  let lastWasEmpty = false;
  for (const line of lines) {
    const isEmpty = line.trim() === '';
    if (isEmpty && lastWasEmpty) {
      continue; // Skip consecutive empty lines
    }
    cleanedLines.push(line);
    lastWasEmpty = isEmpty;
  }
  
  return cleanedLines.join('\n');
}

// Handle input in visual editor
function handleVisualEditorInput(e) {
  if (isVisualEditorSyncing) return;
  
  // Update line numbers immediately
  updateVisualLineNumbers();
  
  // Debounce sync to code editor
  clearTimeout(compileTimer);
  compileTimer = setTimeout(() => {
    const visualEditor = document.getElementById("visual-editor");
    const typstCode = htmlToTypst(visualEditor);
    
    isVisualEditorSyncing = true;
    editor.setValue(typstCode);
    isVisualEditorSyncing = false;
    
    if (autoCompile) {
      compile(typstCode);
    }
  }, COMPILE_DELAY);
  
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => autoSave(), AUTO_SAVE_DELAY);
}

// Handle paste in visual editor - convert to plain text
function handleVisualEditorPaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
}

// Handle special keystrokes in visual editor
function handleVisualEditorKeydown(e) {
  // Enter key - insert new paragraph
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertParagraph', false);
  }
  
  // Tab key - indent
  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  }
  
  // Ctrl/Cmd + B - Bold
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    applyVisualFormatting('bold');
  }
  
  // Ctrl/Cmd + I - Italic
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    applyVisualFormatting('italic');
  }
  
  // Ctrl/Cmd + U - Underline
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    applyVisualFormatting('underline');
  }
}

// Apply formatting in visual editor
function applyVisualFormatting(format) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  const selectedText = range.toString();
  
  if (!selectedText) return;
  
  let wrapper;
  switch (format) {
    case 'bold':
      wrapper = document.createElement('strong');
      wrapper.className = 'visual-bold';
      break;
    case 'italic':
      wrapper = document.createElement('em');
      wrapper.className = 'visual-italic';
      break;
    case 'underline':
      wrapper = document.createElement('u');
      wrapper.className = 'visual-underline';
      break;
    default:
      return;
  }
  
  range.surroundContents(wrapper);
  
  // Trigger sync
  handleVisualEditorInput();
}

// =====================
// RECOMPILE FUNCTIONS
// =====================
function manualRecompile() {
  const source = editorMode === 'visual' 
    ? htmlToTypst(document.getElementById("visual-editor"))
    : editor.getValue();
  compile(source);
  showToast("Recompiling...");
}

function forceRecompile() {
  // Clear any cached state and recompile
  currentPdfBuffer = null;
  manualRecompile();
  showToast("Force recompiling...");
}

function toggleRecompileDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById("recompile-dropdown");
  dropdown.classList.toggle("show");
}

function closeAllDropdowns() {
  document.getElementById("recompile-dropdown")?.classList.remove("show");
}

// =====================
// FIND AND REPLACE
// =====================
function openFind() {
  if (editorMode === 'code' && editor) {
    // Use Monaco's built-in find widget
    editor.trigger('keyboard', 'actions.find');
    editor.focus();
  } else if (editorMode === 'visual') {
    // For visual editor, use browser's native find or custom implementation
    showCustomFindDialog();
  }
}

function openFindReplace() {
  if (editorMode === 'code' && editor) {
    // Use Monaco's built-in find and replace widget
    editor.trigger('keyboard', 'editor.action.startFindReplaceAction');
    editor.focus();
  } else if (editorMode === 'visual') {
    // For visual editor, show custom find/replace dialog
    showCustomFindReplaceDialog();
  }
}

// Custom find dialog for visual editor
function showCustomFindDialog() {
  const content = `
    <div class="find-dialog">
      <div class="find-input-group">
        <label>Find:</label>
        <input type="text" id="find-input" placeholder="Search text..." autofocus>
      </div>
      <div class="find-options">
        <label><input type="checkbox" id="find-case-sensitive"> Case sensitive</label>
        <label><input type="checkbox" id="find-whole-word"> Whole word</label>
      </div>
      <div class="find-results" id="find-results"></div>
      <div class="find-actions">
        <button class="btn" id="find-prev">Previous</button>
        <button class="btn" id="find-next">Next</button>
        <button class="btn primary" id="find-all">Find All</button>
      </div>
    </div>
  `;
  
  showModal("Find", content);
  
  const findInput = document.getElementById("find-input");
  const resultsDiv = document.getElementById("find-results");
  
  let currentIndex = -1;
  let matches = [];
  
  function performFind() {
    const searchText = findInput.value;
    if (!searchText) {
      resultsDiv.textContent = "";
      matches = [];
      return;
    }
    
    const visualEditor = document.getElementById("visual-editor");
    const text = visualEditor.innerText;
    const caseSensitive = document.getElementById("find-case-sensitive").checked;
    const wholeWord = document.getElementById("find-whole-word").checked;
    
    // Find all matches
    matches = [];
    let searchStr = caseSensitive ? searchText : searchText.toLowerCase();
    let textToSearch = caseSensitive ? text : text.toLowerCase();
    
    let pos = 0;
    while ((pos = textToSearch.indexOf(searchStr, pos)) !== -1) {
      if (wholeWord) {
        const before = pos > 0 ? textToSearch[pos - 1] : ' ';
        const after = pos + searchStr.length < textToSearch.length ? textToSearch[pos + searchStr.length] : ' ';
        if (/\w/.test(before) || /\w/.test(after)) {
          pos++;
          continue;
        }
      }
      matches.push(pos);
      pos++;
    }
    
    resultsDiv.textContent = matches.length > 0 
      ? "Found " + matches.length + " match" + (matches.length > 1 ? "es" : "")
      : "No matches found";
    
    currentIndex = matches.length > 0 ? 0 : -1;
    highlightMatch();
  }
  
  function highlightMatch() {
    // Clear previous highlights
    const visualEditor = document.getElementById("visual-editor");
    visualEditor.querySelectorAll('.search-highlight').forEach(el => {
      el.outerHTML = el.innerHTML;
    });
    
    if (currentIndex >= 0 && matches.length > 0) {
      // Highlight current match (simplified - would need more complex implementation for proper highlighting)
      resultsDiv.textContent = "Match " + (currentIndex + 1) + " of " + matches.length;
    }
  }
  
  findInput.addEventListener("input", performFind);
  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        currentIndex = (currentIndex - 1 + matches.length) % matches.length;
      } else {
        currentIndex = (currentIndex + 1) % matches.length;
      }
      highlightMatch();
    }
    if (e.key === "Escape") {
      closeModal();
    }
  });
  
  document.getElementById("find-prev").addEventListener("click", () => {
    if (matches.length > 0) {
      currentIndex = (currentIndex - 1 + matches.length) % matches.length;
      highlightMatch();
    }
  });
  
  document.getElementById("find-next").addEventListener("click", () => {
    if (matches.length > 0) {
      currentIndex = (currentIndex + 1) % matches.length;
      highlightMatch();
    }
  });
  
  document.getElementById("find-all").addEventListener("click", performFind);
}

// Custom find and replace dialog for visual editor
function showCustomFindReplaceDialog() {
  const content = `
    <div class="find-replace-dialog">
      <div class="find-input-group">
        <label>Find:</label>
        <input type="text" id="find-input" placeholder="Search text..." autofocus>
      </div>
      <div class="find-input-group">
        <label>Replace:</label>
        <input type="text" id="replace-input" placeholder="Replace with...">
      </div>
      <div class="find-options">
        <label><input type="checkbox" id="find-case-sensitive"> Case sensitive</label>
        <label><input type="checkbox" id="find-whole-word"> Whole word</label>
      </div>
      <div class="find-results" id="find-results"></div>
      <div class="find-actions">
        <button class="btn" id="find-prev">Previous</button>
        <button class="btn" id="find-next">Next</button>
        <button class="btn" id="replace-one">Replace</button>
        <button class="btn primary" id="replace-all">Replace All</button>
      </div>
    </div>
  `;
  
  showModal("Find & Replace", content);
  
  const findInput = document.getElementById("find-input");
  const replaceInput = document.getElementById("replace-input");
  const resultsDiv = document.getElementById("find-results");
  
  let matchCount = 0;
  
  function countMatches() {
    const searchText = findInput.value;
    if (!searchText) {
      resultsDiv.textContent = "";
      matchCount = 0;
      return;
    }
    
    const visualEditor = document.getElementById("visual-editor");
    const text = visualEditor.innerText;
    const caseSensitive = document.getElementById("find-case-sensitive").checked;
    
    let searchStr = caseSensitive ? searchText : searchText.toLowerCase();
    let textToSearch = caseSensitive ? text : text.toLowerCase();
    
    matchCount = 0;
    let pos = 0;
    while ((pos = textToSearch.indexOf(searchStr, pos)) !== -1) {
      matchCount++;
      pos++;
    }
    
    resultsDiv.textContent = matchCount > 0 
      ? "Found " + matchCount + " match" + (matchCount > 1 ? "es" : "")
      : "No matches found";
  }
  
  function replaceAll() {
    const searchText = findInput.value;
    const replaceText = replaceInput.value;
    if (!searchText) return;
    
    // For visual editor, we need to sync back to code editor and do replace there
    if (editorMode === 'visual') {
      const visualEditor = document.getElementById("visual-editor");
      const typstCode = htmlToTypst(visualEditor);
      
      const caseSensitive = document.getElementById("find-case-sensitive").checked;
      let newCode;
      
      if (caseSensitive) {
        newCode = typstCode.split(searchText).join(replaceText);
      } else {
        newCode = typstCode.replace(new RegExp(escapeRegex(searchText), 'gi'), replaceText);
      }
      
      editor.setValue(newCode);
      updateVisualEditor(newCode);
      compile(newCode);
      
      countMatches();
      showToast("Replaced " + matchCount + " occurrence" + (matchCount > 1 ? "s" : ""));
    }
  }
  
  findInput.addEventListener("input", countMatches);
  
  document.getElementById("replace-all").addEventListener("click", replaceAll);
  
  document.getElementById("find-next").addEventListener("click", countMatches);
  document.getElementById("find-prev").addEventListener("click", countMatches);
  document.getElementById("replace-one").addEventListener("click", () => {
    showToast("Use Replace All for visual editor");
  });
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =====================
// UI SETUP
// =====================
function setupUI() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="app-container">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <button class="icon-btn" id="toggle-sidebar" title="Toggle Sidebar (Ctrl+B)">
            ${icons.sidebar}
          </button>
          <div class="logo">
            <span class="logo-icon">${icons.fileTypst}</span>
            <span class="logo-text">Typst</span>
          </div>
          <div class="header-divider"></div>
          <div class="document-name" id="doc-name">
            <span>${currentFileName}</span>
          </div>
        </div>
        <div class="header-center">
          <button class="header-btn" id="btn-templates" title="Templates">
            ${icons.template}
            <span>Templates</span>
          </button>
        </div>
        <div class="header-right">
          <div class="header-btn-group">
            <button class="icon-btn" id="btn-share" title="Share">
              ${icons.share}
            </button>
            <button class="icon-btn" id="btn-export" title="Export PDF">
              ${icons.download}
            </button>
            <button class="icon-btn" id="btn-settings" title="Settings">
              ${icons.settings}
            </button>
            <button class="icon-btn" id="btn-help" title="Help (F1)">
              ${icons.help}
            </button>
          </div>
        </div>
      </header>


      <!-- Main Content -->
      <div class="main-content">
        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-section">
            <div class="sidebar-header">
              <span>Files</span>
              <div class="sidebar-actions">
                <button class="icon-btn small" id="btn-new-file" title="New File">
                  ${icons.filePlus}
                </button>
                <button class="icon-btn small" id="btn-upload" title="Upload File">
                  ${icons.upload}
                </button>
              </div>
            </div>
            <div class="file-tree" id="file-tree">
              <!-- Rendered dynamically by renderFileTree() -->
            </div>
          </div>
          <div class="sidebar-section">
            <div class="sidebar-header collapsible" id="uploads-header">
              <span>${icons.chevronDown} Uploads</span>
            </div>
            <div class="uploads-list" id="uploads-list"></div>
          </div>
          <div class="sidebar-section">
            <div class="sidebar-header">
              <span>Fonts</span>
              <div class="sidebar-actions">
                <button class="icon-btn small" id="btn-upload-font" title="Upload Font">
                  ${icons.upload}
                </button>
              </div>
            </div>
            <div class="fonts-list" id="fonts-list">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </aside>

        <!-- Resizer -->
        <div class="resizer" id="sidebar-resizer"></div>

        <!-- Editor Panel -->
        <div class="editor-panel" id="editor-panel">
          <!-- Editor Tabs with Mode Toggle -->
          <div class="editor-tabs">
            <div class="editor-tabs-left">
              <div class="tab active" data-file="${currentFileName}">
                <span class="tab-icon">${icons.fileTypst}</span>
                <span class="tab-name">${currentFileName}</span>
                <button class="tab-close" title="Close">${icons.close}</button>
              </div>
            </div>
            <div class="editor-tabs-right">
              <div class="editor-mode-toggle">
                <div class="mode-toggle-bg" id="mode-toggle-bg"></div>
                <button class="mode-toggle-btn active" id="btn-mode-code" title="Source Code (Code Editor)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                  </svg>
                  <span>Source</span>
                </button>
                <button class="mode-toggle-btn" id="btn-mode-visual" title="Rich Text (Visual Editor)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  <span>Rich Text</span>
                </button>
              </div>
            </div>
          </div>
          
          <!-- Compact Formatting Toolbar -->
          <div class="format-bar" id="format-bar">
            <div class="fmt-dropdown" id="font-dropdown">
              <button class="fmt-dropdown-btn" id="btn-font-select" title="Font">
                <span class="font-icon">A</span>
                <span class="font-name" id="current-font">Default</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="fmt-dropdown-menu" id="font-menu">
                <div class="font-option" data-font="">Default</div>
                <div class="font-option" data-font="New Computer Modern">New Computer Modern</div>
                <div class="font-option" data-font="Linux Libertine">Linux Libertine</div>
                <div class="font-option" data-font="Source Sans Pro">Source Sans Pro</div>
                <div class="font-option" data-font="Fira Sans">Fira Sans</div>
                <div class="font-divider"></div>
                <div class="font-section-label">Custom Fonts</div>
                <div id="custom-font-options"></div>
                <div class="font-divider"></div>
                <button class="font-upload-btn" id="btn-font-upload-inline">+ Upload Font</button>
              </div>
            </div>
            <span class="fmt-sep"></span>
            <button class="fmt-btn" id="fmt-bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button class="fmt-btn" id="fmt-italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button class="fmt-btn" id="fmt-underline" title="Underline"><u>U</u></button>
            <button class="fmt-btn" id="fmt-strike" title="Strikethrough"><s>S</s></button>
            <span class="fmt-sep"></span>
            <button class="fmt-btn" id="fmt-heading" title="Heading 1">H1</button>
            <button class="fmt-btn" id="fmt-heading2" title="Heading 2">H2</button>
            <button class="fmt-btn" id="fmt-list" title="Bullet List">☰</button>
            <span class="fmt-sep"></span>
            <button class="fmt-btn" id="fmt-subscript" title="Subscript">x₂</button>
            <button class="fmt-btn" id="fmt-superscript" title="Superscript">x²</button>
            <span class="fmt-sep"></span>
            <button class="fmt-btn" id="fmt-link" title="Link">🔗</button>
            <button class="fmt-btn" id="fmt-image" title="Image">🖼️</button>
            <button class="fmt-btn" id="fmt-table" title="Table">⊞</button>
            <button class="fmt-btn" id="fmt-math" title="Math">∑</button>
            <button class="fmt-btn" id="fmt-code" title="Code">&lt;/&gt;</button>
            <button class="fmt-btn" id="fmt-codeblock" title="Code Block">{ }</button>
            <span class="fmt-sep"></span>
            <button class="fmt-btn" id="fmt-quote" title="Quote">❝</button>
            <button class="fmt-btn" id="fmt-align-left" title="Align Left">⫷</button>
            <button class="fmt-btn" id="fmt-align-center" title="Align Center">☰</button>
            <button class="fmt-btn" id="fmt-align-right" title="Align Right">⫸</button>
            <span class="fmt-sep"></span>
            <button class="fmt-btn search-btn" id="btn-find" title="Find (Ctrl+F)">${icons.search}</button>
            <button class="fmt-btn search-btn" id="btn-replace" title="Find & Replace (Ctrl+H)">⇄</button>
          </div>
          
          <div class="editor-content" id="monaco-editor"></div>
          <div class="visual-editor-container" id="visual-editor-container" style="display: none;">
            <div class="visual-editor-wrapper">
              <div class="visual-line-numbers" id="visual-line-numbers"></div>
              <div class="visual-editor" id="visual-editor" contenteditable="true"></div>
            </div>
          </div>
        </div>

        <!-- Resizer -->
        <div class="resizer" id="preview-resizer"></div>

        <!-- Preview Panel -->
        <div class="preview-panel" id="preview-panel">
          <div class="preview-toolbar">
            <div class="preview-toolbar-left">
              <!-- Recompile Button -->
              <div class="recompile-group">
                <button class="recompile-btn" id="btn-recompile" title="Recompile (Ctrl+Enter)">
                  ${icons.play}
                  <span>Recompile</span>
                </button>
                <button class="recompile-dropdown-btn" id="btn-recompile-dropdown" title="Compile options">
                  ${icons.chevronDown}
                </button>
                <div class="recompile-dropdown" id="recompile-dropdown">
                  <label class="dropdown-item">
                    <input type="checkbox" id="auto-compile-toggle" checked>
                    <span>Auto Compile</span>
                  </label>
                  <div class="dropdown-divider"></div>
                  <button class="dropdown-item" id="btn-force-recompile">
                    ${icons.refresh}
                    <span>Force Recompile</span>
                  </button>
                  <button class="dropdown-item" id="btn-stop-compile">
                    ${icons.close}
                    <span>Stop Compilation</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="preview-toolbar-center">
              <button class="icon-btn small" id="btn-zoom-out" title="Zoom Out">
                ${icons.zoomOut}
              </button>
              <button class="zoom-level-btn" id="zoom-level" title="Reset Zoom">100%</button>
              <button class="icon-btn small" id="btn-zoom-in" title="Zoom In">
                ${icons.zoomIn}
              </button>
              <button class="icon-btn small" id="btn-fit-width" title="Fit Width">
                ${icons.fitWidth}
              </button>
            </div>
            <div class="preview-toolbar-right">
              <span class="page-info" id="page-info">Page 1 of 1</span>
            </div>
          </div>
          <div class="preview-content" id="preview-content">
            <div class="pdf-container" id="pdf-pages"></div>
          </div>
          
          <!-- Error Window (Separate Panel) -->
          <div class="error-window" id="error-window">
            <div class="error-window-header">
              <div class="error-window-header-left">
                <span class="error-window-icon">${icons.error}</span>
                <span class="error-window-title">Compilation Error</span>
              </div>
              <div class="error-window-header-right">
                <button class="icon-btn small" id="btn-toggle-error" title="Minimize">
                  ${icons.chevronDown}
                </button>
                <button class="icon-btn small" id="btn-close-error" title="Close">
                  ${icons.close}
                </button>
              </div>
            </div>
            <div class="error-window-body">
              <div class="error-list"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <footer class="status-bar">
        <div class="status-left">
          <span class="status-item" id="compile-status">
            <span class="status-indicator ready"></span>
            <span>Ready</span>
          </span>
        </div>
        <div class="status-center">
          <span class="status-item" id="cursor-position">Ln 1, Col 1</span>
        </div>
        <div class="status-right">
          <span class="status-item">Typst</span>
        </div>
      </footer>
    </div>

    <!-- Hidden Inputs -->
    <input type="file" id="file-input" multiple accept="image/*,.ttf,.otf,.woff,.woff2,.typ,.txt,.csv,.json,.bib" style="display:none">
    <input type="file" id="font-input" multiple accept=".ttf,.otf,.woff,.woff2" style="display:none">

    <!-- Modals -->
    <div class="modal-overlay" id="modal-overlay" style="display: none;">
      <div class="modal" id="modal">
        <div class="modal-header">
          <span class="modal-title"></span>
          <button class="icon-btn" id="modal-close">${icons.close}</button>
        </div>
        <div class="modal-content"></div>
      </div>
    </div>

    <!-- Toast -->
    <div class="toast" id="toast"></div>
  `;

  // Add styles
  addStyles();

  // Setup event listeners
  setupEventListeners();
  
  // Setup resizers
  setupResizers();
  
  // Render file tree
  renderFileTree();
  
  // Update uploads list
  updateUploadsList();
  
  // Setup drag and drop for uploads
  setupUploadsDragDrop();
}

function setupEventListeners() {
  // Sidebar toggle
  document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);

  // Templates
  document.getElementById("btn-templates").addEventListener("click", showTemplatesModal);

  // Share
  document.getElementById("btn-share").addEventListener("click", handleShare);

  // Export
  document.getElementById("btn-export").addEventListener("click", exportPDF);

  // Settings
  document.getElementById("btn-settings").addEventListener("click", showSettingsModal);

  // Help
  document.getElementById("btn-help").addEventListener("click", showHelpModal);

  // File upload
  document.getElementById("btn-upload").addEventListener("click", () => {
    document.getElementById("file-input").click();
  });
  document.getElementById("file-input").addEventListener("change", handleFileUpload);

  // Font upload
  document.getElementById("btn-upload-font").addEventListener("click", () => {
    document.getElementById("font-input").click();
  });
  document.getElementById("font-input").addEventListener("change", handleFontUpload);

  // Font dropdown in format bar
  setupFontDropdown();

  // Zoom controls
  document.getElementById("btn-zoom-in").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomIn();
  });
  document.getElementById("btn-zoom-out").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomOut();
  });
  document.getElementById("btn-fit-width").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fitWidth();
  });
  document.getElementById("zoom-level").addEventListener("click", (e) => {
    e.preventDefault();
    resetZoom();
  });

  // Error window controls
  document.getElementById("btn-close-error").addEventListener("click", () => {
    const errorWindow = document.getElementById("error-window");
    if (errorWindow) {
      errorWindow.classList.remove("visible");
    }
  });
  
  document.getElementById("btn-toggle-error").addEventListener("click", () => {
    const errorWindow = document.getElementById("error-window");
    if (errorWindow) {
      errorWindow.classList.toggle("minimized");
    }
  });

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Formatting buttons
  setupFormattingButtons();

  // New file button
  document.getElementById("btn-new-file").addEventListener("click", showNewFileModal);

  // Tab close button
  document.querySelector(".tab-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("Clear document and start fresh?")) {
      editor.setValue(`= New Document\n\nStart writing here...\n`);
      showToast("Document cleared");
    }
  });
  
  // Editor mode toggle
  document.getElementById("btn-mode-code").addEventListener("click", () => switchEditorMode('code'));
  document.getElementById("btn-mode-visual").addEventListener("click", () => switchEditorMode('visual'));
  
  // Visual editor input handling
  const visualEditor = document.getElementById("visual-editor");
  visualEditor.addEventListener("input", handleVisualEditorInput);
  visualEditor.addEventListener("paste", handleVisualEditorPaste);
  visualEditor.addEventListener("keydown", handleVisualEditorKeydown);
  
  // Recompile button and dropdown
  document.getElementById("btn-recompile").addEventListener("click", manualRecompile);
  document.getElementById("btn-recompile-dropdown").addEventListener("click", toggleRecompileDropdown);
  document.getElementById("auto-compile-toggle").addEventListener("change", (e) => {
    autoCompile = e.target.checked;
    showToast(autoCompile ? "Auto-compile enabled" : "Auto-compile disabled");
  });
  document.getElementById("btn-force-recompile").addEventListener("click", () => {
    closeAllDropdowns();
    forceRecompile();
  });
  document.getElementById("btn-stop-compile").addEventListener("click", () => {
    closeAllDropdowns();
    showToast("Compilation stopped");
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".recompile-group")) {
      closeAllDropdowns();
    }
  });
  
  // Find and Replace buttons
  document.getElementById("btn-find").addEventListener("click", openFind);
  document.getElementById("btn-replace").addEventListener("click", openFindReplace);
}

// =====================
// SIDEBAR
// =====================
function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  const sidebar = document.getElementById("sidebar");
  const resizer = document.getElementById("sidebar-resizer");
  
  sidebar.style.display = sidebarVisible ? "flex" : "none";
  resizer.style.display = sidebarVisible ? "block" : "none";
}

// =====================
// RESIZERS
// =====================
function setupResizers() {
  setupResizer("sidebar-resizer", "sidebar", "left");
  setupResizer("preview-resizer", "preview-panel", "right");
}

function setupResizer(resizerId, panelId, direction) {
  const resizer = document.getElementById(resizerId);
  const panel = document.getElementById(panelId);
  
  let startX, startWidth;

  resizer.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  function resize(e) {
    const diff = direction === "left" ? e.clientX - startX : startX - e.clientX;
    const newWidth = Math.max(200, Math.min(600, startWidth + diff));
    panel.style.width = `${newWidth}px`;
    panel.style.flex = "none";
  }

  function stopResize() {
    document.removeEventListener("mousemove", resize);
    document.removeEventListener("mouseup", stopResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

// =====================
// STATUS BAR
// =====================
function updateStatusBar() {
  const statusEl = document.getElementById("compile-status");
  const indicator = statusEl.querySelector(".status-indicator");
  const text = statusEl.querySelector("span:last-child");

  indicator.className = `status-indicator ${compileStatus}`;
  
  switch (compileStatus) {
    case "compiling":
      text.textContent = "Compiling...";
      break;
    case "error":
      text.textContent = "Error";
      break;
    default:
      text.textContent = "Ready";
  }
}

function updateCursorPosition(position) {
  const el = document.getElementById("cursor-position");
  if (el) {
    el.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  }
}

// =====================
// TEMPLATES
// =====================
function showTemplatesModal() {
  const templateList = getTemplateList();
  
  const content = `
    <div class="templates-grid">
      ${templateList.map(t => `
        <div class="template-card" data-id="${t.id}">
          <div class="template-icon">${t.icon}</div>
          <div class="template-info">
            <div class="template-name">${t.name}</div>
            <div class="template-desc">${t.description}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  showModal("Templates", content);

  // Add click handlers
  document.querySelectorAll(".template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = getTemplate(card.dataset.id);
      if (template && editor) {
        editor.setValue(template.content);
        closeModal();
        showToast(`Loaded "${template.name}" template`);
      }
    });
  });
}

// =====================
// NEW FILE
// =====================
function showNewFileModal() {
  const content = `
    <div class="new-file-form">
      <div class="settings-group">
        <label for="new-file-name">File Name</label>
        <input type="text" id="new-file-name" value="document.typ" placeholder="Enter file name (e.g., document.typ)">
      </div>
      <p>Create a new Typst document:</p>
      <div class="new-file-options">
        <button class="btn primary" id="new-blank">Create New Document</button>
        <button class="btn" id="new-from-template">From Template</button>
      </div>
      <div class="new-file-info">
        <small>Your current document will be saved automatically.</small>
      </div>
    </div>
  `;

  showModal("New Document", content);

  const fileNameInput = document.getElementById("new-file-name");
  fileNameInput.focus();
  fileNameInput.select();

  const handleCreate = () => {
    let fileName = fileNameInput.value.trim() || "document.typ";
    // Ensure .typ extension
    if (!fileName.toLowerCase().endsWith(".typ")) {
      fileName += ".typ";
    }
    
    // Create new document (saves current one automatically)
    // Returns actual filename used (may be modified if duplicate)
    const actualFileName = createNewDocument(fileName);
    
    closeModal();
    showToast(`Created "${actualFileName}"`);
  };

  document.getElementById("new-blank").addEventListener("click", handleCreate);
  
  fileNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  });

  document.getElementById("new-from-template").addEventListener("click", () => {
    closeModal();
    showTemplatesModal();
  });
}

// =====================
// SETTINGS
// =====================
function showSettingsModal() {
  const content = `
    <div class="settings-form">
      <div class="settings-group">
        <label>Theme</label>
        <select id="setting-theme">
          <option value="system" ${settings.theme === "system" ? "selected" : ""}>System</option>
          <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
          <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
        </select>
      </div>
      <div class="settings-group">
        <label>Font Size</label>
        <input type="number" id="setting-font-size" value="${settings.fontSize}" min="10" max="24">
      </div>
      <div class="settings-group">
        <label>Word Wrap</label>
        <select id="setting-word-wrap">
          <option value="on" ${settings.wordWrap === "on" ? "selected" : ""}>On</option>
          <option value="off" ${settings.wordWrap === "off" ? "selected" : ""}>Off</option>
        </select>
      </div>
      <div class="settings-group">
        <label>Line Numbers</label>
        <select id="setting-line-numbers">
          <option value="on" ${settings.lineNumbers === "on" ? "selected" : ""}>On</option>
          <option value="off" ${settings.lineNumbers === "off" ? "selected" : ""}>Off</option>
          <option value="relative" ${settings.lineNumbers === "relative" ? "selected" : ""}>Relative</option>
        </select>
      </div>
      <div class="settings-group">
        <label>
          <input type="checkbox" id="setting-minimap" ${settings.minimap ? "checked" : ""}>
          Show Minimap
        </label>
      </div>
      <div class="settings-actions">
        <button class="btn primary" id="save-settings">Save Settings</button>
      </div>
    </div>
  `;

  showModal("Settings", content);

  document.getElementById("save-settings").addEventListener("click", () => {
    settings.theme = document.getElementById("setting-theme").value;
    settings.fontSize = parseInt(document.getElementById("setting-font-size").value);
    settings.wordWrap = document.getElementById("setting-word-wrap").value;
    settings.lineNumbers = document.getElementById("setting-line-numbers").value;
    settings.minimap = document.getElementById("setting-minimap").checked;

    applySettings();
    applyTheme();
    saveSettings();
    closeModal();
    showToast("Settings saved");
  });
}

function applySettings() {
  if (editor) {
    editor.updateOptions({
      fontSize: settings.fontSize,
      wordWrap: settings.wordWrap,
      lineNumbers: settings.lineNumbers,
      minimap: { enabled: settings.minimap },
    });
  }
}

function saveSettings() {
  try {
    localStorage.setItem("typst-editor-settings", JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save settings:", e);
  }
}

function loadSettings() {
  try {
    const saved = localStorage.getItem("typst-editor-settings");
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
}

// =====================
// THEME
// =====================
function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  let theme = settings.theme;
  
  // If system, detect the actual theme
  if (theme === "system") {
    theme = getSystemTheme();
  }
  
  // Apply theme to document
  document.documentElement.setAttribute("data-theme", theme);
  
  // Update Monaco editor theme
  if (editor) {
    const monacoTheme = theme === "dark" ? "typst-dark" : "typst-light";
    monaco.editor.setTheme(monacoTheme);
  }
}

function setupSystemThemeListener() {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", () => {
    if (settings.theme === "system") {
      applyTheme();
    }
  });
}

// =====================
// HELP
// =====================
function showHelpModal() {
  const content = `
    <div class="help-content">
      <div class="help-tabs">
        <button class="help-tab active" data-tab="quickstart">Quick Start</button>
        <button class="help-tab" data-tab="syntax">Syntax</button>
        <button class="help-tab" data-tab="shortcuts">Shortcuts</button>
        <button class="help-tab" data-tab="resources">Resources</button>
      </div>
      
      <div class="help-tab-content active" id="tab-quickstart">
        <h3>🚀 Getting Started</h3>
        <p>Welcome to Typst Playground! Here's how to get started:</p>
        
        <div class="help-section">
          <h4>1. Write Your Document</h4>
          <p>Type in the editor on the left. Your document compiles automatically!</p>
          <pre class="help-code">= Hello World

This is my first document in *Typst*!

== Features
- Easy to learn
- Beautiful output
- Fast compilation</pre>
        </div>
        
        <div class="help-section">
          <h4>2. Use Templates</h4>
          <p>Click <strong>Templates</strong> in the toolbar to start with a pre-made template.</p>
        </div>
        
        <div class="help-section">
          <h4>3. Add Images</h4>
          <p>Drag images to the <strong>Uploads</strong> section, then use:</p>
          <pre class="help-code">#image("photo.png", width: 80%)</pre>
        </div>
        
        <div class="help-section">
          <h4>4. Export PDF</h4>
          <p>Click the <strong>Download</strong> button to save your PDF.</p>
        </div>
      </div>
      
      <div class="help-tab-content" id="tab-syntax">
        <h3>📝 Basic Syntax</h3>
        
        <div class="help-section">
          <h4>Headings</h4>
          <pre class="help-code">= Level 1 Heading
== Level 2 Heading
=== Level 3 Heading</pre>
        </div>
        
        <div class="help-section">
          <h4>Text Formatting</h4>
          <pre class="help-code">*Bold text*
_Italic text_
*_Bold and italic_*
\`inline code\`
#strike[strikethrough]
#underline[underlined]</pre>
        </div>
        
        <div class="help-section">
          <h4>Lists</h4>
          <pre class="help-code">- Bullet item 1
- Bullet item 2

+ Numbered item 1
+ Numbered item 2</pre>
        </div>
        
        <div class="help-section">
          <h4>Math</h4>
          <pre class="help-code">Inline: $E = m c^2$

Display:
$ integral_0^infinity e^(-x^2) dif x $</pre>
        </div>
        
        <div class="help-section">
          <h4>Tables</h4>
          <pre class="help-code">#table(
  columns: 3,
  [A], [B], [C],
  [1], [2], [3],
)</pre>
        </div>
        
        <div class="help-section">
          <h4>Images & Figures</h4>
          <pre class="help-code">#figure(
  image("photo.png", width: 80%),
  caption: [My caption]
)</pre>
        </div>
        
        <div class="help-section">
          <h4>Page Setup</h4>
          <pre class="help-code">#set page(paper: "a4", margin: 2cm)
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true)</pre>
        </div>
      </div>
      
      <div class="help-tab-content" id="tab-shortcuts">
        <h3>⌨️ Keyboard Shortcuts</h3>
        <div class="shortcuts-grid">
          <div class="shortcut-group">
            <h4>Document</h4>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>S</kbd> <span>Save</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>E</kbd> <span>Export PDF</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> <span>Recompile</span></div>
          </div>
          
          <div class="shortcut-group">
            <h4>Editor</h4>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>F</kbd> <span>Find</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>H</kbd> <span>Replace</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>/</kbd> <span>Comment</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>Space</kbd> <span>Autocomplete</span></div>
          </div>
          
          <div class="shortcut-group">
            <h4>View</h4>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>B</kbd> <span>Toggle sidebar</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>+</kbd> <span>Zoom in</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>-</kbd> <span>Zoom out</span></div>
            <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>0</kbd> <span>Reset zoom</span></div>
          </div>
          
          <div class="shortcut-group">
            <h4>Other</h4>
            <div class="shortcut"><kbd>F1</kbd> <span>Help</span></div>
            <div class="shortcut"><kbd>Esc</kbd> <span>Close modal</span></div>
          </div>
        </div>
      </div>
      
      <div class="help-tab-content" id="tab-resources">
        <h3>📚 Resources</h3>
        <div class="help-links">
          <a href="/tutorial.html" class="tutorial-link">
            📖 Full Tutorial Guide
          </a>
          <a href="https://typst.app/docs" target="_blank" rel="noopener">
            ${icons.externalLink} Typst Documentation
          </a>
          <a href="https://typst.app/docs/tutorial" target="_blank" rel="noopener">
            ${icons.externalLink} Official Tutorial
          </a>
          <a href="https://typst.app/docs/reference" target="_blank" rel="noopener">
            ${icons.externalLink} Function Reference
          </a>
          <a href="https://typst.app/universe" target="_blank" rel="noopener">
            ${icons.externalLink} Package Universe
          </a>
          <a href="https://github.com/typst/typst" target="_blank" rel="noopener">
            ${icons.externalLink} Typst GitHub
          </a>
          <a href="https://discord.gg/typst" target="_blank" rel="noopener">
            ${icons.externalLink} Discord Community
          </a>
        </div>
        
        <h3 style="margin-top: 1.5em;">💡 Tips</h3>
        <ul class="help-tips">
          <li>Press <kbd>Ctrl</kbd>+<kbd>Space</kbd> to see autocomplete suggestions</li>
          <li>Drag files directly onto the Uploads section</li>
          <li>Use the Share button to create a link to your document</li>
          <li>The app works offline after the first load!</li>
        </ul>
      </div>
    </div>
  `;

  showModal("Help & Tutorial", content, "large");
  
  // Setup tab switching
  setTimeout(() => {
    document.querySelectorAll('.help-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active from all tabs and contents
        document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.help-tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active to clicked tab and corresponding content
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });
  }, 0);
}

// =====================
// KEYBOARD SHORTCUTS
// =====================
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      autoSave();
      showToast("Document saved");
    }
    
    // Ctrl/Cmd + B: Toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      toggleSidebar();
    }
    
    // Ctrl/Cmd + E: Export
    if ((e.ctrlKey || e.metaKey) && e.key === "e") {
      e.preventDefault();
      exportPDF();
    }
    
    // Ctrl/Cmd + +: Zoom in
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
      e.preventDefault();
      zoomIn();
    }
    
    // Ctrl/Cmd + -: Zoom out
    if ((e.ctrlKey || e.metaKey) && e.key === "-") {
      e.preventDefault();
      zoomOut();
    }
    
    // Ctrl/Cmd + 0: Reset zoom
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      resetZoom();
    }
    
    // F1: Help
    if (e.key === "F1") {
      e.preventDefault();
      showHelpModal();
    }
    
    // Escape: Close modal
    if (e.key === "Escape") {
      closeModal();
      closeAllDropdowns();
    }
    
    // Ctrl/Cmd + Enter: Recompile
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      manualRecompile();
    }
    
    // Ctrl/Cmd + F: Find (only intercept in visual mode, Monaco handles code mode)
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && editorMode === 'visual') {
      e.preventDefault();
      openFind();
    }
    
    // Ctrl/Cmd + H: Find and Replace
    if ((e.ctrlKey || e.metaKey) && e.key === "h") {
      e.preventDefault();
      openFindReplace();
    }
  });
}

// =====================
// FILE UPLOADS
// =====================
async function handleFileUpload(event) {
  const files = event.target.files || (event.dataTransfer && event.dataTransfer.files);
  if (!files || !files.length) {
    console.log("[Upload] No files selected");
    return;
  }

  console.log(`[Upload] Processing ${files.length} file(s)`);

  for (const file of files) {
    console.log(`[Upload] Processing: ${file.name} (${file.type}, ${file.size} bytes)`);
    try {
      const buffer = await fileToArrayBuffer(file);
      const path = file.name;

      const fileType = getFileType(file.name);
      console.log(`[Upload] File type detected: ${fileType}`);
      
      await saveFile(path, buffer, fileType, DOCUMENT_ID);

      currentFiles.set(path, new Uint8Array(buffer));
      console.log(`[Upload] Added to VFS: ${path}`);

      showToast(`Uploaded: ${file.name}`);
    } catch (e) {
      console.error("[Upload] Failed:", e);
      showToast(`Failed to upload: ${file.name}`);
    }
  }

  updateUploadsList();
  compile(editor.getValue());
  if (event.target && event.target.value !== undefined) {
    event.target.value = "";
  }
}

// Setup drag and drop for uploads section
function setupUploadsDragDrop() {
  const uploadsList = document.getElementById("uploads-list");
  if (!uploadsList) return;
  
  // Prevent default drag behaviors
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    uploadsList.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });
  
  // Highlight drop zone
  ["dragenter", "dragover"].forEach(eventName => {
    uploadsList.addEventListener(eventName, () => {
      uploadsList.classList.add("drag-over");
    }, false);
  });
  
  ["dragleave", "drop"].forEach(eventName => {
    uploadsList.addEventListener(eventName, () => {
      uploadsList.classList.remove("drag-over");
    }, false);
  });
  
  // Handle dropped files
  uploadsList.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload({ dataTransfer: e.dataTransfer });
    }
  }, false);
}

function getFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "font";
  return "other";
}

async function loadFilesIntoVFS() {
  try {
    const files = await getAllFiles(DOCUMENT_ID);
    for (const file of files) {
      if (file.data instanceof ArrayBuffer) {
        currentFiles.set(file.path, new Uint8Array(file.data));
      } else if (file.data instanceof Uint8Array) {
        currentFiles.set(file.path, file.data);
      }
    }
    console.log(`Loaded ${currentFiles.size} files into VFS`);
    updateUploadsList();
  } catch (e) {
    console.warn("Failed to load files:", e);
  }
}

// Preload sample assets from public folder into VFS
async function preloadSampleAssets() {
  const sampleAssets = [
    { path: "elsevier_logo_wide.png", url: "/assets/elsevier_logo_wide.png" },
    { path: "s_NA103569.jpg", url: "/assets/s_NA103569.jpg" },
  ];
  
  console.log(`[Preload] Loading ${sampleAssets.length} sample assets...`);
  
  for (const asset of sampleAssets) {
    // Skip if already loaded
    if (currentFiles.has(asset.path)) {
      console.log(`[Preload] Skipping ${asset.path} (already loaded)`);
      continue;
    }
    
    try {
      console.log(`[Preload] Fetching ${asset.url}...`);
      const response = await fetch(asset.url);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        currentFiles.set(asset.path, new Uint8Array(buffer));
        console.log(`[Preload] Loaded: ${asset.path} (${buffer.byteLength} bytes)`);
      } else {
        console.warn(`[Preload] Failed to load ${asset.path}: ${response.status}`);
      }
    } catch (e) {
      console.warn(`[Preload] Error loading ${asset.path}:`, e);
    }
  }
  
  // Update the uploads list to show preloaded assets
  updateUploadsList();
}

function updateUploadsList() {
  const list = document.getElementById("uploads-list");
  if (!list) return;

  if (currentFiles.size === 0) {
    list.innerHTML = '<div class="empty-message">No uploaded files</div>';
    return;
  }

  list.innerHTML = Array.from(currentFiles.keys())
    .map(path => {
      const fileType = getFileType(path);
      const icon = fileType === "image" ? icons.image : icons.file;
      return `
        <div class="file-item" data-path="${path}">
          <span class="file-icon">${icon}</span>
          <span class="file-name">${path}</span>
          <button class="icon-btn small delete-file" data-path="${path}" title="Delete">
            ${icons.trash}
          </button>
        </div>
      `;
    })
    .join("");

  // Add delete handlers
  list.querySelectorAll(".delete-file").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      try {
        await deleteFile(path, DOCUMENT_ID);
        currentFiles.delete(path);
        updateUploadsList();
        compile(editor.getValue());
        showToast(`Deleted: ${path}`);
      } catch (err) {
        showToast(`Failed to delete: ${path}`);
      }
    });
  });
}

// =====================
// FONT MANAGEMENT
// =====================
async function handleFontUpload(event) {
  const files = event.target.files;
  if (!files.length) return;

  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      showToast(`Invalid font format: ${file.name}. Use TTF, OTF, WOFF, or WOFF2.`);
      continue;
    }

    try {
      const buffer = await fileToArrayBuffer(file);
      const path = `fonts/${file.name}`;
      
      await saveFile(path, buffer, 'font', 'global');
      
      // Add to loaded fonts
      loadedFonts.push({
        name: file.name,
        path: path,
        data: new Uint8Array(buffer)
      });
      
      showToast(`Font loaded: ${file.name}`);
    } catch (e) {
      console.error("Font upload failed:", e);
      showToast(`Failed to load font: ${file.name}`);
    }
  }

  updateFontsList();
  
  // Notify compiler worker about new fonts
  sendFontsToWorker();
  
  // Recompile to use new fonts
  compile(editor.getValue());
  
  event.target.value = "";
}

async function loadSavedFonts() {
  try {
    const files = await getAllFiles();
    loadedFonts = files
      .filter(f => f.type === 'font')
      .map(f => ({
        name: f.path.replace('fonts/', ''),
        path: f.path,
        data: new Uint8Array(f.data)
      }));
    
    updateFontsList();
    
    if (loadedFonts.length > 0) {
      sendFontsToWorker();
    }
  } catch (e) {
    console.error("Failed to load saved fonts:", e);
  }
}

function sendFontsToWorker() {
  if (!compilerWorker) return;
  
  console.log(`[Main] Sending ${loadedFonts.length} fonts to worker`);
  
  // Update autocomplete with custom font names
  updateCustomFonts(loadedFonts.map(f => f.name));
  
  // Create copies of font data to ensure proper transfer
  const fontData = loadedFonts.map(f => {
    // Create a copy of the Uint8Array
    const dataCopy = new Uint8Array(f.data);
    console.log(`[Main] Font: ${f.name}, size: ${dataCopy.length} bytes`);
    return {
      name: f.name,
      data: dataCopy
    };
  });
  
  compilerWorker.postMessage({
    type: 'loadFonts',
    fonts: fontData
  });
}

function updateFontsList() {
  const list = document.getElementById("fonts-list");
  if (!list) return;

  if (loadedFonts.length === 0) {
    list.innerHTML = '<div class="empty-message">No custom fonts loaded</div>';
    return;
  }

  list.innerHTML = loadedFonts.map(font => {
    const ext = font.name.split('.').pop().toUpperCase();
    return `
      <div class="font-item" data-path="${font.path}">
        <span class="font-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M4 7V4h16v3"/>
            <path d="M9 20h6"/>
            <path d="M12 4v16"/>
          </svg>
        </span>
        <span class="font-name">${font.name}</span>
        <span class="font-badge">${ext}</span>
        <button class="icon-btn small delete-font" data-path="${font.path}" title="Remove Font">
          ${icons.trash}
        </button>
      </div>
    `;
  }).join("");

  // Add delete handlers
  list.querySelectorAll(".delete-font").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      try {
        await deleteFile(path);
        loadedFonts = loadedFonts.filter(f => f.path !== path);
        updateFontsList();
        sendFontsToWorker();
        showToast(`Font removed: ${path.replace('fonts/', '')}`);
      } catch (err) {
        showToast(`Failed to remove font`);
      }
    });
  });
}

function showFontManager() {
  const content = `
    <div class="font-manager">
      <div class="font-manager-header">
        <p>Upload custom fonts to use in your Typst documents.</p>
        <p class="text-muted">Supported formats: TTF, OTF, WOFF, WOFF2</p>
      </div>
      
      <div class="font-upload-zone" id="font-upload-zone">
        <input type="file" id="font-file-input" accept=".ttf,.otf,.woff,.woff2" multiple hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
          <path d="M4 7V4h16v3"/>
          <path d="M9 20h6"/>
          <path d="M12 4v16"/>
        </svg>
        <p>Drop font files here or click to browse</p>
      </div>
      
      <div class="loaded-fonts-section">
        <h4>Loaded Fonts (${loadedFonts.length})</h4>
        <div class="loaded-fonts-list" id="modal-fonts-list">
          ${loadedFonts.length === 0 
            ? '<div class="empty-message">No custom fonts loaded</div>'
            : loadedFonts.map(font => `
                <div class="font-list-item" data-path="${font.path}">
                  <span class="font-preview" style="font-family: '${font.name.replace(/\.[^/.]+$/, '')}', sans-serif;">Aa</span>
                  <span class="font-info">
                    <span class="font-name">${font.name}</span>
                    <span class="font-size">${formatBytes(font.data.length)}</span>
                  </span>
                  <button class="btn-remove-font" data-path="${font.path}">Remove</button>
                </div>
              `).join('')
          }
        </div>
      </div>
      
      <div class="font-usage-info">
        <h4>Usage in Typst</h4>
        <pre><code>#set text(font: "Font Name")</code></pre>
      </div>
    </div>
  `;

  showModal("Font Manager", content);
  
  const uploadZone = document.getElementById("font-upload-zone");
  const fileInput = document.getElementById("font-file-input");
  
  uploadZone.addEventListener("click", () => fileInput.click());
  
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
  
  uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("drag-over");
  });
  
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    const files = e.dataTransfer.files;
    handleFontUploadFromModal(files);
  });
  
  fileInput.addEventListener("change", (e) => {
    handleFontUploadFromModal(e.target.files);
  });
  
  // Add remove handlers in modal
  document.querySelectorAll(".btn-remove-font").forEach(btn => {
    btn.addEventListener("click", async () => {
      const path = btn.dataset.path;
      await deleteFile(path);
      loadedFonts = loadedFonts.filter(f => f.path !== path);
      updateFontsList();
      sendFontsToWorker();
      showFontManager(); // Refresh modal
      showToast(`Font removed`);
    });
  });
}

async function handleFontUploadFromModal(files) {
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      showToast(`Invalid format: ${file.name}`);
      continue;
    }

    try {
      const buffer = await fileToArrayBuffer(file);
      const path = `fonts/${file.name}`;
      
      await saveFile(path, buffer, 'font', 'global');
      
      loadedFonts.push({
        name: file.name,
        path: path,
        data: new Uint8Array(buffer)
      });
      
      showToast(`Font loaded: ${file.name}`);
    } catch (e) {
      showToast(`Failed to load: ${file.name}`);
    }
  }

  updateFontsList();
  sendFontsToWorker();
  compile(editor.getValue());
  showFontManager(); // Refresh modal
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// =====================
// FONT DROPDOWN
// =====================
let currentSelectedFont = "";

function setupFontDropdown() {
  const dropdown = document.getElementById("font-dropdown");
  const btn = document.getElementById("btn-font-select");
  const menu = document.getElementById("font-menu");
  
  if (!dropdown || !btn || !menu) return;
  
  // Toggle dropdown
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
    updateCustomFontOptions();
  });
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove("open");
    }
  });
  
  // Font option click handlers
  menu.addEventListener("click", (e) => {
    const option = e.target.closest(".font-option");
    if (option) {
      const fontName = option.dataset.font;
      selectFont(fontName);
      dropdown.classList.remove("open");
    }
  });
  
  // Inline upload button
  const uploadBtn = document.getElementById("btn-font-upload-inline");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.remove("open");
      document.getElementById("font-input").click();
    });
  }
}

function updateCustomFontOptions() {
  const container = document.getElementById("custom-font-options");
  if (!container) return;
  
  if (loadedFonts.length === 0) {
    container.innerHTML = '<div class="font-option" style="color: var(--text-muted); font-style: italic;">No custom fonts</div>';
    return;
  }
  
  container.innerHTML = loadedFonts.map(font => {
    const fontName = font.name.replace(/\.[^/.]+$/, ''); // Remove extension
    const isSelected = currentSelectedFont === fontName;
    return `<div class="font-option ${isSelected ? 'selected' : ''}" data-font="${fontName}">${fontName}</div>`;
  }).join('');
}

function selectFont(fontName) {
  currentSelectedFont = fontName;
  
  // Update display
  const fontNameDisplay = document.getElementById("current-font");
  if (fontNameDisplay) {
    fontNameDisplay.textContent = fontName || "Default";
  }
  
  // Insert or update font setting in the document
  applyFontToDocument(fontName);
  
  showToast(fontName ? `Font: ${fontName}` : "Font: Default");
}

function applyFontToDocument(fontName) {
  if (!editor) return;
  
  const content = editor.getValue();
  const fontDirective = fontName ? `#set text(font: "${fontName}")` : '';
  
  // Check if there's already a font directive at the start
  const fontRegex = /^#set text\(font: "[^"]*"\)\n?/;
  
  if (fontRegex.test(content)) {
    // Replace existing font directive
    const newContent = fontName 
      ? content.replace(fontRegex, fontDirective + '\n')
      : content.replace(fontRegex, '');
    editor.setValue(newContent);
  } else if (fontName) {
    // Add font directive at the beginning
    editor.setValue(fontDirective + '\n' + content);
  }
  
  // Trigger recompile
  if (autoCompile) {
    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => compile(editor.getValue()), COMPILE_DELAY);
  }
}

// =====================
// SHARE
// =====================
async function handleShare() {
  const content = editor.getValue();
  const info = getShareLinkInfo(content);

  if (info.isTooLong) {
    showToast("Document too large to share via URL");
    return;
  }

  const result = await copyShareLink(content);
  if (result.success) {
    showToast("Share link copied to clipboard!");
  } else {
    prompt("Share link (copy manually):", result.url);
  }
}

// =====================
// EXPORT
// =====================
function exportPDF() {
  if (!currentPdfBuffer) {
    showToast("No PDF to export. Please wait for compilation.");
    return;
  }

  const content = `
    <div class="export-form">
      <div class="settings-group">
        <label for="export-filename">Filename</label>
        <input type="text" id="export-filename" value="document" placeholder="Enter filename">
      </div>
      <div class="settings-actions">
        <button class="btn primary" id="confirm-export">Export PDF</button>
      </div>
    </div>
  `;

  showModal("Export PDF", content);

  const filenameInput = document.getElementById("export-filename");
  filenameInput.focus();
  filenameInput.select();

  const doExport = () => {
    let filename = filenameInput.value.trim() || "document";
    if (!filename.toLowerCase().endsWith(".pdf")) {
      filename += ".pdf";
    }

    try {
      // currentPdfBuffer is already a clean Uint8Array copy
      const blob = new Blob([currentPdfBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after a short delay
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      closeModal();
      showToast(`PDF exported as "${filename}"!`);
    } catch (err) {
      console.error("Export error:", err);
      showToast("Failed to export PDF: " + err.message);
    }
  };

  document.getElementById("confirm-export").addEventListener("click", doExport);
  filenameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doExport();
    }
  });
}

// =====================
// MODAL
// =====================
function showModal(title, content, size = "default") {
  const overlay = document.getElementById("modal-overlay");
  const modal = document.getElementById("modal");
  
  modal.querySelector(".modal-title").textContent = title;
  modal.querySelector(".modal-content").innerHTML = content;
  
  // Set modal size
  modal.classList.remove("modal-large", "modal-small");
  if (size === "large") {
    modal.classList.add("modal-large");
  } else if (size === "small") {
    modal.classList.add("modal-small");
  }
  
  overlay.style.display = "flex";
}

function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
  // Reset modal size
  document.getElementById("modal").classList.remove("modal-large", "modal-small");
}

// =====================
// TOAST
// =====================
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

// =====================
// STYLES
// =====================
function addStyles() {
  const style = document.createElement("style");
  style.textContent = `
    /* CSS Variables - Dark Theme (Default) */
    :root, [data-theme="dark"] {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-tertiary: #0f0f1a;
      --bg-hover: #252545;
      --bg-active: #2d2d5a;
      --border-color: #2a2a4a;
      --text-primary: #e4e4e7;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent: #22d3ee;
      --accent-hover: #06b6d4;
      --accent-muted: rgba(34, 211, 238, 0.1);
      --success: #4ade80;
      --warning: #fbbf24;
      --error: #f87171;
      --header-height: 48px;
      --status-height: 24px;
      --sidebar-width: 240px;
    }

    /* Light Theme */
    [data-theme="light"] {
      --bg-primary: #ffffff;
      --bg-secondary: #f8fafc;
      --bg-tertiary: #f1f5f9;
      --bg-hover: #e2e8f0;
      --bg-active: #cbd5e1;
      --border-color: #e2e8f0;
      --text-primary: #1e293b;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --accent: #0891b2;
      --accent-hover: #0e7490;
      --accent-muted: rgba(8, 145, 178, 0.1);
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
    }

    /* Reset */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body, html {
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      font-size: 13px;
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow: hidden;
    }

    #app {
      height: 100%;
    }

    /* App Container */
    .app-container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      height: var(--header-height);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      flex-shrink: 0;
    }

    .header-left, .header-center, .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-left {
      flex: 1;
    }

    .header-right {
      flex: 1;
      justify-content: flex-end;
    }

    .header-btn-group {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 4px;
    }

    .header-btn-group .icon-btn {
      border-radius: 6px;
    }

    .header-divider {
      width: 1px;
      height: 24px;
      background: var(--border-color);
      margin: 0 8px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--accent);
      font-weight: 600;
    }

    .logo-icon {
      width: 20px;
      height: 20px;
      display: flex;
    }

    .logo-icon svg {
      width: 100%;
      height: 100%;
    }

    .document-name {
      color: var(--text-secondary);
      font-size: 13px;
    }

    /* Buttons */
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .icon-btn.small {
      width: 24px;
      height: 24px;
    }

    .icon-btn svg {
      width: 18px;
      height: 18px;
    }

    .icon-btn.small svg {
      width: 14px;
      height: 14px;
    }

    .header-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }

    .header-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .header-btn svg {
      width: 16px;
      height: 16px;
    }

    .header-btn.primary {
      background: var(--accent);
      color: var(--bg-primary);
    }

    .header-btn.primary:hover {
      background: var(--accent-hover);
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }

    .btn.primary {
      background: var(--accent);
      color: var(--bg-primary);
    }

    .btn.primary:hover {
      background: var(--accent-hover);
    }

    .btn.danger {
      background: var(--error);
      color: white;
    }

    .btn.danger:hover {
      background: #ef4444;
    }

    /* Confirm Modal */
    .confirm-modal {
      text-align: center;
    }

    .confirm-message {
      margin-bottom: 20px;
      color: var(--text-primary);
      line-height: 1.5;
    }

    .confirm-message small {
      color: var(--text-muted);
    }

    .confirm-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .confirm-actions .btn {
      min-width: 100px;
    }

    /* Main Content */
    .main-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-section {
      border-bottom: 1px solid var(--border-color);
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }

    .sidebar-header.collapsible {
      cursor: pointer;
    }

    .sidebar-header.collapsible:hover {
      color: var(--text-secondary);
    }

    .sidebar-header svg {
      width: 12px;
      height: 12px;
      margin-right: 4px;
    }

    .sidebar-actions {
      display: flex;
      gap: 4px;
    }

    .file-tree, .uploads-list, .fonts-list {
      padding: 4px 8px;
    }
    
    .uploads-list {
      min-height: 50px;
      transition: all 0.2s;
    }
    
    .uploads-list.drag-over {
      background: var(--accent-muted);
      border: 2px dashed var(--accent);
      border-radius: 6px;
    }

    .file-item, .font-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.15s;
    }

    .file-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .file-item.active {
      background: var(--accent-muted);
      color: var(--accent);
    }

    .file-icon {
      width: 16px;
      height: 16px;
      display: flex;
      flex-shrink: 0;
    }

    .file-icon svg {
      width: 100%;
      height: 100%;
    }

    .file-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }

    .file-item .delete-doc-btn {
      opacity: 0;
      transition: opacity 0.15s;
    }

    .file-item:hover .delete-doc-btn {
      opacity: 1;
    }

    .empty-message {
      padding: 12px;
      color: var(--text-muted);
      font-size: 12px;
      text-align: center;
    }

    /* Font Items */
    .font-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      color: var(--text-secondary);
      transition: all 0.15s;
    }

    .font-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .font-icon {
      width: 14px;
      height: 14px;
      display: flex;
      flex-shrink: 0;
      color: var(--accent);
    }

    .font-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .font-badge {
      font-size: 9px;
      padding: 2px 4px;
      background: var(--bg-tertiary);
      color: var(--text-muted);
      border-radius: 3px;
      font-weight: 600;
    }

    .font-item .delete-font {
      opacity: 0;
      transition: opacity 0.15s;
    }

    .font-item:hover .delete-font {
      opacity: 1;
    }

    /* Font Manager Modal */
    .font-manager {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .font-manager-header p {
      margin: 0 0 8px 0;
      color: var(--text-secondary);
    }

    .font-manager-header .text-muted {
      color: var(--text-muted);
      font-size: 12px;
    }

    .font-upload-zone {
      border: 2px dashed var(--border-color);
      border-radius: 12px;
      padding: 32px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--bg-tertiary);
    }

    .font-upload-zone:hover,
    .font-upload-zone.drag-over {
      border-color: var(--accent);
      background: var(--accent-muted);
    }

    .font-upload-zone svg {
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .font-upload-zone p {
      margin: 0;
      color: var(--text-muted);
      font-size: 14px;
    }

    .loaded-fonts-section h4 {
      margin: 0 0 12px 0;
      color: var(--text-primary);
      font-size: 14px;
    }

    .loaded-fonts-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
    }

    .font-list-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 8px;
    }

    .font-preview {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-secondary);
      border-radius: 6px;
      font-size: 18px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .font-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .font-info .font-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .font-info .font-size {
      font-size: 12px;
      color: var(--text-muted);
    }

    .btn-remove-font {
      padding: 6px 12px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s;
    }

    .btn-remove-font:hover {
      background: var(--error);
      border-color: var(--error);
      color: white;
    }

    .font-usage-info {
      background: var(--bg-tertiary);
      padding: 16px;
      border-radius: 8px;
    }

    .font-usage-info h4 {
      margin: 0 0 8px 0;
      color: var(--text-primary);
      font-size: 13px;
    }

    .font-usage-info pre {
      margin: 0;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      overflow-x: auto;
    }

    .font-usage-info code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--accent);
    }

    /* Resizer */
    .resizer {
      width: 4px;
      background: transparent;
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.15s;
    }

    .resizer:hover {
      background: var(--accent);
    }

    /* Editor Panel */
    .editor-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 300px;
      background: var(--bg-tertiary);
    }

    /* Compact Format Bar */
    .format-bar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .fmt-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 26px;
      padding: 0 6px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.12s ease;
    }

    .fmt-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .fmt-btn:active {
      background: var(--bg-active);
    }

    .fmt-btn b {
      font-weight: 700;
    }

    .fmt-btn i {
      font-style: italic;
    }

    .fmt-btn u {
      text-decoration: underline;
    }

    .fmt-btn s {
      text-decoration: line-through;
    }

    .fmt-sep {
      width: 1px;
      height: 18px;
      background: var(--border-color);
      margin: 0 4px;
    }

    .fmt-btn.search-btn {
      color: var(--accent);
    }

    .fmt-btn.search-btn svg {
      width: 14px;
      height: 14px;
    }

    /* Font Dropdown in Format Bar */
    .fmt-dropdown {
      position: relative;
    }

    .fmt-dropdown-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s;
    }

    .fmt-dropdown-btn:hover {
      background: var(--bg-hover);
      border-color: var(--text-muted);
      color: var(--text-primary);
    }

    .fmt-dropdown-btn .font-icon {
      font-weight: 700;
      font-size: 14px;
    }

    .fmt-dropdown-btn .font-name {
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fmt-dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      min-width: 200px;
      max-height: 300px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 1000;
      display: none;
    }

    .fmt-dropdown.open .fmt-dropdown-menu {
      display: block;
    }

    .font-option {
      padding: 10px 14px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-secondary);
      transition: all 0.1s;
    }

    .font-option:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .font-option.selected {
      background: var(--accent-muted);
      color: var(--accent);
    }

    .font-divider {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }

    .font-section-label {
      padding: 8px 14px 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }

    .font-upload-btn {
      display: block;
      width: calc(100% - 16px);
      margin: 8px;
      padding: 10px;
      background: var(--bg-tertiary);
      border: 1px dashed var(--border-color);
      border-radius: 6px;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      text-align: center;
      transition: all 0.15s;
    }

    .font-upload-btn:hover {
      background: var(--accent-muted);
      border-color: var(--accent);
      color: var(--accent);
    }

    .fmt-btn.search-btn:hover {
      background: var(--accent-muted);
      color: var(--accent);
    }

    /* Find/Replace Dialog */
    .find-dialog,
    .find-replace-dialog {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .find-input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .find-input-group label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .find-input-group input[type="text"] {
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 14px;
      width: 100%;
      transition: all 0.15s ease;
    }

    .find-input-group input[type="text"]:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-muted);
    }

    .find-input-group input[type="text"]::placeholder {
      color: var(--text-muted);
    }

    .find-options {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .find-options label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .find-options input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
    }

    .find-results {
      font-size: 13px;
      color: var(--text-muted);
      min-height: 20px;
    }

    .find-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .find-actions .btn {
      padding: 8px 16px;
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
    }

    .find-actions .btn:hover {
      background: var(--bg-active);
    }

    .find-actions .btn.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--bg-primary);
    }

    .find-actions .btn.primary:hover {
      background: var(--accent-hover);
    }

    /* Search highlight */
    .search-highlight {
      background: #ffeb3b;
      color: #000;
      border-radius: 2px;
    }

    .search-highlight.current {
      background: #ff9800;
    }

    /* Recompile Button Group (Preview Panel) */
    .recompile-group {
      display: flex;
      align-items: center;
      position: relative;
    }

    .recompile-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      border: none;
      border-radius: 4px 0 0 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.15s ease;
      box-shadow: 0 1px 3px rgba(34, 197, 94, 0.3);
    }

    .recompile-btn:hover {
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      box-shadow: 0 2px 6px rgba(34, 197, 94, 0.4);
    }

    .recompile-btn svg {
      width: 14px;
      height: 14px;
    }

    .recompile-dropdown-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 6px;
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: white;
      border: none;
      border-left: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0 4px 4px 0;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .recompile-dropdown-btn:hover {
      background: linear-gradient(135deg, #15803d 0%, #166534 100%);
    }

    .recompile-dropdown-btn svg {
      width: 12px;
      height: 12px;
    }

    .recompile-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 180px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 1000;
      display: none;
      overflow: hidden;
    }

    .recompile-dropdown.show {
      display: block;
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
    }

    .dropdown-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .dropdown-item svg {
      width: 14px;
      height: 14px;
    }

    .dropdown-item input[type="checkbox"] {
      width: 14px;
      height: 14px;
      accent-color: var(--accent);
    }

    .dropdown-divider {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }

    /* Mode Toggle - Overleaf Style */
    .editor-mode-toggle {
      display: flex;
      align-items: center;
      position: relative;
      background: #1a1a2e;
      border: 1px solid #3a3a5a;
      border-radius: 8px;
      padding: 3px;
      gap: 0;
    }

    .mode-toggle-bg {
      position: absolute;
      top: 3px;
      left: 3px;
      width: calc(50% - 3px);
      height: calc(100% - 6px);
      background: linear-gradient(135deg, #138a36 0%, #0d6e2a 100%);
      border-radius: 6px;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px rgba(19, 138, 54, 0.3);
      z-index: 0;
    }

    .editor-mode-toggle.visual-active .mode-toggle-bg {
      transform: translateX(100%);
    }

    .mode-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: #888;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: color 0.2s ease;
      position: relative;
      z-index: 1;
      flex: 1;
      white-space: nowrap;
    }

    .mode-toggle-btn svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .mode-toggle-btn:hover {
      color: #bbb;
    }

    .mode-toggle-btn.active {
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .mode-toggle-btn.active svg {
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
    }

    /* Editor Tabs */
    .editor-tabs {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 0 8px;
      height: 36px;
      flex-shrink: 0;
    }

    .editor-tabs-left {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .editor-tabs-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 4px 4px 0 0;
      cursor: pointer;
      font-size: 12px;
      border: 1px solid transparent;
      border-bottom: none;
      margin-bottom: -1px;
    }

    .tab:hover {
      background: var(--bg-hover);
    }

    .tab.active {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-color: var(--border-color);
    }

    .tab-icon {
      width: 14px;
      height: 14px;
      display: flex;
    }

    .tab-icon svg {
      width: 100%;
      height: 100%;
    }

    .tab-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: all 0.15s;
    }

    .tab:hover .tab-close {
      opacity: 1;
    }

    .tab-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .tab-close svg {
      width: 12px;
      height: 12px;
    }

    .editor-content {
      flex: 1;
      overflow: hidden;
    }

    /* Visual Editor - Overleaf Style */
    .visual-editor-container {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #fdfdfd;
    }

    .visual-editor-wrapper {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .visual-line-numbers {
      width: 50px;
      background: #f7f7f7;
      border-right: 1px solid #e0e0e0;
      padding: 16px 0;
      overflow-y: auto;
      flex-shrink: 0;
      user-select: none;
      scrollbar-width: none;
    }

    .visual-line-numbers::-webkit-scrollbar {
      display: none;
    }

    .visual-line-number {
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #9ca3af;
      line-height: 28px;
    }

    .visual-line-number:hover {
      color: #6b7280;
    }

    .visual-line-number.active {
      color: #138a07;
      background: rgba(19, 138, 7, 0.08);
    }

    .visual-editor {
      flex: 1;
      padding: 16px 24px;
      overflow-y: auto;
      outline: none;
      font-family: 'Source Serif Pro', 'Georgia', 'Times New Roman', serif;
      font-size: 15px;
      line-height: 28px;
      color: #333333;
      background: #fdfdfd;
    }

    .visual-editor:focus {
      outline: none;
    }

    /* Visual Editor Typography */
    .visual-h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a1a;
      line-height: 32px;
      margin: 0;
      border-bottom: 2px solid #138a07;
      padding-bottom: 4px;
    }

    .visual-h2 {
      font-size: 20px;
      font-weight: 600;
      color: #2c3e50;
      line-height: 28px;
      margin: 0;
    }

    .visual-h3 {
      font-size: 17px;
      font-weight: 600;
      color: #34495e;
      line-height: 28px;
      margin: 0;
    }

    .visual-h4 {
      font-size: 15px;
      font-weight: 600;
      color: #4a5568;
      line-height: 28px;
      margin: 0;
    }

    .visual-paragraph {
      margin: 0;
      line-height: 28px;
    }

    .visual-paragraph-break {
      height: 28px;
    }

    /* List Items */
    .visual-list-item {
      display: flex;
      gap: 8px;
      line-height: 28px;
      margin: 0;
    }

    .visual-bullet, .visual-enum, .visual-num {
      flex-shrink: 0;
      color: #138a07;
      font-weight: 600;
      min-width: 1.5em;
    }

    /* Code Blocks */
    .visual-code-block {
      background: #f4f4f4;
      color: #333;
      padding: 0 12px;
      border-radius: 4px;
      border-left: 3px solid #138a07;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
      line-height: 28px;
      overflow-x: auto;
      margin: 0;
      white-space: pre;
    }

    .visual-code-block code {
      background: none;
      padding: 0;
      font-size: inherit;
    }

    /* Inline Elements */
    .visual-bold {
      font-weight: 700;
      color: #1a1a1a;
    }

    .visual-italic {
      font-style: italic;
    }

    .visual-underline {
      text-decoration: underline;
    }

    .visual-strike {
      text-decoration: line-through;
      color: #9ca3af;
    }

    .visual-inline-code {
      background: #f0f0f0;
      color: #c7254e;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }

    .visual-inline-math {
      background: #fff8e6;
      color: #8b5a00;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
    }

    .visual-math-block {
      background: #fff8e6;
      color: #8b5a00;
      padding: 8px 16px;
      border-radius: 4px;
      border-left: 3px solid #f0ad4e;
      line-height: 28px;
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
    }

    .visual-link {
      color: #138a07;
      text-decoration: none;
      border-bottom: 1px solid rgba(19, 138, 7, 0.3);
      transition: all 0.15s;
    }

    .visual-link:hover {
      color: #0d6b05;
      border-bottom-color: #138a07;
    }

    .visual-sub {
      font-size: 0.75em;
      vertical-align: sub;
    }

    .visual-super {
      font-size: 0.75em;
      vertical-align: super;
    }

    /* Special Elements */
    .visual-directive {
      color: #a855f7;
      line-height: 28px;
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
    }

    .visual-figure {
      color: #0284c7;
      line-height: 28px;
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
    }

    .visual-table {
      color: #138a07;
      line-height: 28px;
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
    }

    .visual-comment {
      color: #9ca3af;
      font-style: italic;
      line-height: 28px;
      padding: 4px 0;
    }

    .visual-function {
      color: #7c3aed;
      font-family: 'JetBrains Mono', monospace;
    }

    .visual-label {
      background: #e0f2fe;
      color: #0369a1;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }

    .visual-ref {
      background: #fce7f3;
      color: #be185d;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }

    /* Selection in visual editor */
    .visual-editor ::selection {
      background: #b8e6b8;
    }

    /* Preview Panel */
    .preview-panel {
      width: 50%;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      border-left: 1px solid var(--border-color);
      min-width: 300px;
    }

    .preview-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      height: 36px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .preview-toolbar-left, .preview-toolbar-center, .preview-toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .preview-title {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .zoom-level, .zoom-level-btn {
      font-size: 12px;
      color: var(--text-secondary);
      min-width: 45px;
      text-align: center;
    }

    .zoom-level-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .zoom-level-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .page-info {
      font-size: 12px;
      color: var(--text-muted);
    }

    .preview-content {
      flex: 1;
      overflow: auto;
      background: #404040;
    }

    .error-panel {
      background: rgba(248, 113, 113, 0.1);
      border-bottom: 1px solid var(--error);
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      color: var(--error);
      font-size: 12px;
      font-weight: 500;
    }

    .error-header .icon-btn {
      margin-left: auto;
      color: var(--error);
    }

    .error-icon {
      width: 16px;
      height: 16px;
      display: flex;
    }

    .error-icon svg {
      width: 100%;
      height: 100%;
    }

    .error-content {
      padding: 8px 12px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--error);
      white-space: pre-wrap;
      max-height: 150px;
      overflow: auto;
    }

    .pdf-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
      gap: 24px;
    }

    .pdf-page-wrapper {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .pdf-page {
      display: block;
      background: white;
    }

    /* Status Bar */
    .status-bar {
      height: var(--status-height);
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      flex-shrink: 0;
    }

    .status-left, .status-center, .status-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .status-item {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
    }

    .status-indicator.ready {
      background: var(--success);
    }

    .status-indicator.compiling {
      background: var(--warning);
      animation: pulse 1s infinite;
    }

    .status-indicator.error {
      background: var(--error);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    
    .modal.modal-large {
      max-width: 800px;
      max-height: 85vh;
    }
    
    .modal.modal-small {
      max-width: 400px;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .modal-title {
      font-size: 16px;
      font-weight: 600;
    }

    .modal-content {
      padding: 20px;
      overflow-y: auto;
    }

    /* Templates Grid */
    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .template-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .template-card:hover {
      background: var(--bg-active);
      border-color: var(--accent);
    }

    .template-icon {
      font-size: 24px;
    }

    .template-info {
      flex: 1;
    }

    .template-name {
      font-weight: 500;
      margin-bottom: 2px;
    }

    .template-desc {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Settings Form */
    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .settings-group {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .settings-group label {
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .settings-group input[type="number"],
    .settings-group select {
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 13px;
      min-width: 100px;
    }

    .settings-group input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }

    .settings-actions {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }

    /* Help Content */
    .help-content {
      min-height: 400px;
    }
    
    .help-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }
    
    .help-tab {
      padding: 8px 16px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      border-radius: 4px 4px 0 0;
      transition: all 0.15s;
    }
    
    .help-tab:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
    
    .help-tab.active {
      color: var(--accent);
      background: var(--accent-muted);
    }
    
    .help-tab-content {
      display: none;
    }
    
    .help-tab-content.active {
      display: block;
    }
    
    .help-content h3 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-primary);
    }

    .help-content h3:not(:first-child) {
      margin-top: 20px;
    }
    
    .help-content h4 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    
    .help-content p {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      line-height: 1.5;
    }
    
    .help-section {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 6px;
    }
    
    .help-code {
      font-family: "Fira Code", "Consolas", monospace;
      font-size: 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 10px;
      margin: 8px 0 0 0;
      overflow-x: auto;
      white-space: pre;
      color: var(--text-primary);
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    
    .shortcut-group {
      background: var(--bg-tertiary);
      border-radius: 6px;
      padding: 12px;
    }
    
    .shortcut-group h4 {
      margin-bottom: 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .shortcut {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    
    .shortcut:last-child {
      margin-bottom: 0;
    }

    .shortcut kbd {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      padding: 2px 5px;
      font-family: inherit;
      font-size: 10px;
      min-width: 20px;
      text-align: center;
    }
    
    .shortcut span {
      flex: 1;
    }

    .help-links {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .help-links a {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--accent);
      text-decoration: none;
      font-size: 13px;
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      transition: all 0.15s;
    }

    .help-links a:hover {
      background: var(--bg-hover);
    }
    
    .help-links a.tutorial-link {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
      border: 1px solid var(--accent);
    }
    
    .help-links a.tutorial-link:hover {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.3));
    }
    
    .help-tips {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .help-tips li {
      font-size: 13px;
      color: var(--text-secondary);
      padding: 8px 0;
      border-bottom: 1px solid var(--border-color);
    }
    
    .help-tips li:last-child {
      border-bottom: none;
    }
    
    .help-tips kbd {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      padding: 2px 5px;
      font-size: 11px;
    }

    .help-links svg {
      width: 14px;
      height: 14px;
    }

    /* New File Modal */
    .new-file-form {
      text-align: center;
    }

    .new-file-form p {
      color: var(--text-secondary);
      margin-bottom: 20px;
    }

    .new-file-options {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 20px;
    }

    .new-file-warning {
      color: var(--text-muted);
      font-size: 12px;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 13px;
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 1001;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg-tertiary);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-muted);
    }

    /* Monaco Editor Overrides */
    .monaco-editor {
      padding-top: 0 !important;
    }

    .monaco-editor .margin {
      background: var(--bg-tertiary) !important;
    }

    /* Error Window - Separate Panel at bottom of preview */
    .error-window {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 50%;
      background: var(--bg-secondary);
      border-top: 2px solid var(--error);
      display: none;
      flex-direction: column;
      z-index: 100;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
    }

    .error-window.visible {
      display: flex;
    }

    .error-window.minimized .error-window-body {
      display: none;
    }

    .error-window.minimized {
      max-height: auto;
    }

    .error-window-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: linear-gradient(135deg, rgba(248, 113, 113, 0.15) 0%, rgba(248, 113, 113, 0.05) 100%);
      border-bottom: 1px solid rgba(248, 113, 113, 0.3);
      flex-shrink: 0;
    }

    .error-window-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .error-window-header-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .error-window-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      color: var(--error);
    }

    .error-window-icon svg {
      width: 100%;
      height: 100%;
    }

    .error-window-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--error);
      letter-spacing: 0.3px;
    }

    .error-window-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
      max-height: 300px;
    }

    .error-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .error-item {
      padding: 12px 16px;
      background: transparent;
      border-left: 3px solid transparent;
      transition: all 0.15s ease;
    }

    .error-item:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .error-item.clickable {
      cursor: pointer;
    }

    .error-item.clickable:hover {
      background: rgba(255, 255, 255, 0.06);
      border-left-color: var(--accent);
    }

    .error-item.error {
      border-left-color: var(--error);
    }

    .error-item.warning {
      border-left-color: var(--warning);
    }

    .error-item-header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .error-severity-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .error-severity-icon svg {
      width: 100%;
      height: 100%;
    }

    .error-severity-icon.error {
      color: var(--error);
    }

    .error-severity-icon.warning {
      color: var(--warning);
    }

    .error-message {
      flex: 1;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
      font-size: 13px;
      color: var(--text-primary);
      line-height: 1.5;
      word-break: break-word;
    }

    .error-location {
      margin-top: 6px;
      margin-left: 26px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 11px;
      color: var(--accent);
      background: rgba(34, 211, 238, 0.1);
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
    }

    .error-hint {
      margin-top: 8px;
      margin-left: 26px;
      font-size: 12px;
      color: var(--text-secondary);
      padding: 8px 12px;
      background: rgba(74, 222, 128, 0.08);
      border-left: 2px solid var(--success);
      border-radius: 0 4px 4px 0;
    }

    .hint-label {
      font-weight: 600;
      color: var(--success);
    }

    /* Make preview-panel position relative for absolute error window */
    .preview-panel {
      position: relative;
    }

    /* Adjust preview content when error window is visible */
    .error-window.visible ~ .preview-content,
    .preview-panel:has(.error-window.visible) .preview-content {
      padding-bottom: 200px;
    }
  `;
  document.head.appendChild(style);
}

// =====================
// START
// =====================
init().catch(console.error);
