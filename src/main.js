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
import { registerTypstLanguage } from "./typst-language.js";
import { initStorage, saveDocument, getDocument, getAllDocuments, deleteDocument, getMostRecentDocument, saveFile, getAllFiles, deleteFile, fileToArrayBuffer } from "./storage.js";
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
  theme: "dark",
};

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

  // Create editor
  editor = monaco.editor.create(document.getElementById("monaco-editor"), {
    value: initialContent,
    language: "typst",
    theme: "typst-dark",
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
    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => compile(editor.getValue()), COMPILE_DELAY);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => autoSave(), AUTO_SAVE_DELAY);
  });

  // Track cursor position
  editor.onDidChangeCursorPosition((e) => {
    updateCursorPosition(e.position);
  });

  // Load uploaded files into virtual filesystem
  await loadFilesIntoVFS();

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
  const { type, ok, pdfBuffer, error } = event.data;

  if (type === "compiled") {
    if (!ok) {
      setCompileStatus("error", error);
      return;
    }

    if (!pdfBuffer) {
      setCompileStatus("error", "Compilation produced no output");
      return;
    }

    currentPdfBuffer = pdfBuffer;
    renderPDF(pdfBuffer);
    setCompileStatus("ready");
  }
}

function setCompileStatus(status, error = "") {
  compileStatus = status;
  errorMessage = error;
  updateStatusBar();
  
  const errorPanel = document.getElementById("error-panel");
  if (status === "error" && error) {
    errorPanel.style.display = "block";
    errorPanel.querySelector(".error-content").textContent = error;
  } else {
    errorPanel.style.display = "none";
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
    renderPDF(currentPdfBuffer);
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
          <button class="header-btn" id="btn-share" title="Share">
            ${icons.share}
            <span>Share</span>
          </button>
          <button class="header-btn primary" id="btn-export" title="Export PDF">
            ${icons.download}
            <span>Export</span>
          </button>
          <div class="header-divider"></div>
          <button class="icon-btn" id="btn-settings" title="Settings">
            ${icons.settings}
          </button>
          <button class="icon-btn" id="btn-help" title="Help (F1)">
            ${icons.help}
          </button>
        </div>
      </header>

      <!-- Formatting Toolbar -->
      <div class="format-toolbar-container">
        <div class="format-toolbar">
          <div class="format-panel">
            <span class="format-panel-label">Text</span>
            <div class="format-panel-buttons">
              <button class="format-btn" id="fmt-bold" title="Bold">B</button>
              <button class="format-btn" id="fmt-italic" title="Italic">I</button>
              <button class="format-btn" id="fmt-underline" title="Underline"><u>U</u></button>
              <button class="format-btn" id="fmt-strike" title="Strikethrough"><s>S</s></button>
            </div>
          </div>
          <div class="format-panel">
            <span class="format-panel-label">Script</span>
            <div class="format-panel-buttons">
              <button class="format-btn" id="fmt-subscript" title="Subscript">X₂</button>
              <button class="format-btn" id="fmt-superscript" title="Superscript">X²</button>
            </div>
          </div>
          <div class="format-panel">
            <span class="format-panel-label">Structure</span>
            <div class="format-panel-buttons">
              <button class="format-btn" id="fmt-heading" title="Heading">=</button>
              <button class="format-btn" id="fmt-heading2" title="Heading 2">==</button>
              <button class="format-btn" id="fmt-list" title="List">•</button>
              <button class="format-btn" id="fmt-quote" title="Blockquote">❝</button>
            </div>
          </div>
          <div class="format-panel">
            <span class="format-panel-label">Align</span>
            <div class="format-panel-buttons">
              <button class="format-btn" id="fmt-align-left" title="Align Left">⫷</button>
              <button class="format-btn" id="fmt-align-center" title="Align Center">⫸</button>
              <button class="format-btn" id="fmt-align-right" title="Align Right">⫸</button>
            </div>
          </div>
          <div class="format-panel">
            <span class="format-panel-label">Insert</span>
            <div class="format-panel-buttons">
              <button class="format-btn" id="fmt-link" title="Link">🔗</button>
              <button class="format-btn" id="fmt-image" title="Image">🖼</button>
              <button class="format-btn" id="fmt-table" title="Table">▦</button>
              <button class="format-btn" id="fmt-code" title="Inline Code">\`</button>
              <button class="format-btn" id="fmt-codeblock" title="Code Block">{}</button>
              <button class="format-btn" id="fmt-math" title="Math">∑</button>
            </div>
          </div>
        </div>
      </div>

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
        </aside>

        <!-- Resizer -->
        <div class="resizer" id="sidebar-resizer"></div>

        <!-- Editor Panel -->
        <div class="editor-panel" id="editor-panel">
          <div class="editor-tabs">
            <div class="tab active" data-file="${currentFileName}">
              <span class="tab-icon">${icons.fileTypst}</span>
              <span class="tab-name">${currentFileName}</span>
              <button class="tab-close" title="Close">${icons.close}</button>
            </div>
          </div>
          <div class="editor-content" id="monaco-editor"></div>
        </div>

        <!-- Resizer -->
        <div class="resizer" id="preview-resizer"></div>

        <!-- Preview Panel -->
        <div class="preview-panel" id="preview-panel">
          <div class="preview-toolbar">
            <div class="preview-toolbar-left">
              <span class="preview-title">Preview</span>
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
            <div class="error-panel" id="error-panel" style="display: none;">
              <div class="error-header">
                <span class="error-icon">${icons.error}</span>
                <span>Compilation Error</span>
                <button class="icon-btn small" id="btn-close-error">${icons.close}</button>
              </div>
              <pre class="error-content"></pre>
            </div>
            <div class="pdf-container" id="pdf-pages"></div>
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

  // Error panel close
  document.getElementById("btn-close-error").addEventListener("click", () => {
    document.getElementById("error-panel").style.display = "none";
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
    settings.fontSize = parseInt(document.getElementById("setting-font-size").value);
    settings.wordWrap = document.getElementById("setting-word-wrap").value;
    settings.lineNumbers = document.getElementById("setting-line-numbers").value;
    settings.minimap = document.getElementById("setting-minimap").checked;

    applySettings();
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
// HELP
// =====================
function showHelpModal() {
  const content = `
    <div class="help-content">
      <h3>Keyboard Shortcuts</h3>
      <div class="shortcuts-list">
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>S</kbd> <span>Save document</span></div>
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>B</kbd> <span>Toggle sidebar</span></div>
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>E</kbd> <span>Export PDF</span></div>
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>+</kbd> <span>Zoom in</span></div>
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>-</kbd> <span>Zoom out</span></div>
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>0</kbd> <span>Reset zoom</span></div>
        <div class="shortcut"><kbd>F1</kbd> <span>Show help</span></div>
      </div>
      <h3>Resources</h3>
      <div class="help-links">
        <a href="https://typst.app/docs" target="_blank" rel="noopener">
          ${icons.externalLink} Typst Documentation
        </a>
        <a href="https://typst.app/docs/tutorial" target="_blank" rel="noopener">
          ${icons.externalLink} Tutorial
        </a>
        <a href="https://typst.app/docs/reference" target="_blank" rel="noopener">
          ${icons.externalLink} Reference
        </a>
      </div>
    </div>
  `;

  showModal("Help", content);
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
    }
  });
}

// =====================
// FILE UPLOADS
// =====================
async function handleFileUpload(event) {
  const files = event.target.files;
  if (!files.length) return;

  for (const file of files) {
    try {
      const buffer = await fileToArrayBuffer(file);
      const path = file.name;

      const fileType = getFileType(file.name);
      await saveFile(path, buffer, fileType, DOCUMENT_ID);

      currentFiles.set(path, new Uint8Array(buffer));

      showToast(`Uploaded: ${file.name}`);
    } catch (e) {
      console.error("Upload failed:", e);
      showToast(`Failed to upload: ${file.name}`);
    }
  }

  updateUploadsList();
  compile(editor.getValue());
  event.target.value = "";
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

    const blob = new Blob([currentPdfBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closeModal();
    showToast(`PDF exported as "${filename}"!`);
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
function showModal(title, content) {
  const overlay = document.getElementById("modal-overlay");
  const modal = document.getElementById("modal");
  
  modal.querySelector(".modal-title").textContent = title;
  modal.querySelector(".modal-content").innerHTML = content;
  
  overlay.style.display = "flex";
}

function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
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
    /* CSS Variables */
    :root {
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

    .file-tree, .uploads-list {
      padding: 4px 8px;
    }

    .file-item {
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

    .editor-tabs {
      display: flex;
      align-items: center;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 0 8px;
      height: 36px;
      flex-shrink: 0;
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
    .help-content h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-primary);
    }

    .help-content h3:not(:first-child) {
      margin-top: 20px;
    }

    .shortcuts-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .shortcut {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .shortcut kbd {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: inherit;
      font-size: 11px;
    }

    .help-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .help-links a {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--accent);
      text-decoration: none;
      font-size: 13px;
    }

    .help-links a:hover {
      text-decoration: underline;
    }

    .help-links svg {
      width: 14px;
      height: 14px;
    }

    /* Formatting Toolbar */
    .format-toolbar-container {
      display: flex;
      justify-content: center;
      padding: 4px 12px;
      background: #ffffff;
      border-bottom: 1px solid #e0e0e0;
    }

    .format-toolbar {
      display: flex;
      align-items: stretch;
      gap: 6px;
      padding: 2px;
    }

    .format-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #ffffff;
      padding: 4px 6px 5px;
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      border: 1px solid #e0e0e0;
    }

    .format-panel-label {
      font-size: 9px;
      font-weight: 500;
      color: #666666;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 3px;
    }

    .format-panel-buttons {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .format-btn {
      width: 26px;
      height: 26px;
      border: none;
      background: transparent;
      color: #333333;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .format-btn:hover {
      background: #f0f0f0;
      color: #000000;
    }

    .format-btn:active {
      background: #e0e0e0;
      color: #000000;
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
  `;
  document.head.appendChild(style);
}

// =====================
// START
// =====================
init().catch(console.error);
