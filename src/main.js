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
import { PaginationValidator, getAvailablePageSizes, getDefaultRules } from "./pagination-validator.js";

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
let errorDecorations = []; // Monaco editor decorations for error highlighting
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

// Pagination Validation
let paginationValidator = null;
let validationResults = null;
let validationPanelVisible = false;
let autoValidate = true;

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
    glyphMargin: true,
  });

  // Setup event listeners
  editor.getModel().onDidChangeContent(() => {
    if (autoCompile) {
      clearTimeout(compileTimer);
      compileTimer = setTimeout(() => compile(editor.getValue()), COMPILE_DELAY);
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => autoSave(), AUTO_SAVE_DELAY);
    
    // Update outline
    updateOutline();
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
  
  // Initial outline
  updateOutline();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  isInitialized = true;

  // Show onboarding tutorial for first-time users
  if (!localStorage.getItem('tutorialCompleted')) {
    setTimeout(() => startOnboardingTutorial(), 500);
  }
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

  // Update header document name text
  const docNameText = document.querySelector("#doc-name .document-name-text");
  if (docNameText) {
    docNameText.textContent = newName;
  }

  // Update active tab name and data attribute
  const activeTab = document.querySelector(".tab.active");
  if (activeTab) {
    activeTab.setAttribute("data-file", newName);
    const tabName = activeTab.querySelector(".tab-name");
    if (tabName) {
      tabName.textContent = newName;
    }
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

// =====================
// DOCUMENT OUTLINE
// =====================

// State for outline
let outlineItems = [];
let outlineUpdateTimer = null;

// Parse headings from Typst document
function parseOutline(source) {
  const lines = source.split('\n');
  const headings = [];
  
  let inCodeBlock = false;
  let inRawBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Track code blocks (```)
    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    
    // Track raw blocks (#raw)
    if (trimmedLine.startsWith('#raw(') || trimmedLine.includes('```')) {
      continue;
    }
    
    // Skip if inside code block
    if (inCodeBlock) continue;
    
    // Skip comment lines
    if (trimmedLine.startsWith('//')) continue;
    
    // Match heading patterns: = Heading, == Heading, etc.
    const headingMatch = line.match(/^(={1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      let title = headingMatch[2].trim();
      
      // Remove trailing markup like <label>
      title = title.replace(/<[^>]+>$/, '').trim();
      
      // Remove inline markup for display
      title = title
        .replace(/\*([^*]+)\*/g, '$1')  // *bold*
        .replace(/_([^_]+)_/g, '$1')    // _italic_
        .replace(/`([^`]+)`/g, '$1')    // `code`
        .replace(/#[a-z]+\[[^\]]*\]/g, '') // #func[content]
        .replace(/#[a-z]+\([^)]*\)/g, '') // #func(args)
        .trim();
      
      if (title) {
        headings.push({
          level,
          title,
          line: i + 1, // 1-based line number
        });
      }
    }
  }
  
  return headings;
}

// Render the outline in the sidebar
function renderOutline() {
  const outlineList = document.getElementById('outline-list');
  const outlineEmpty = document.getElementById('outline-empty');
  
  if (!outlineList) return;
  
  if (outlineItems.length === 0) {
    outlineList.innerHTML = `
      <div class="empty-state" id="outline-empty">
        <span>No headings found</span>
      </div>
    `;
    return;
  }
  
  // Find minimum level for proper indentation
  const minLevel = Math.min(...outlineItems.map(h => h.level));
  
  // Check if item has children (next item has higher level)
  const hasChildren = (idx) => {
    if (idx >= outlineItems.length - 1) return false;
    return outlineItems[idx + 1].level > outlineItems[idx].level;
  };
  
  outlineList.innerHTML = outlineItems.map((item, index) => {
    const indentLevel = item.level - minLevel;
    const levelClass = `level-${item.level}`;
    const indentStyle = `padding-left: ${12 + indentLevel * 14}px`;
    const hasKids = hasChildren(index);
    
    return `
      <div class="outline-item ${levelClass} ${hasKids ? 'has-children' : ''}" 
           data-line="${item.line}" 
           data-index="${index}"
           data-level="${item.level}"
           style="${indentStyle}"
           title="Line ${item.line}: ${escapeHtml(item.title)}">
        <span class="outline-toggle ${hasKids ? '' : 'hidden'}">▸</span>
        <span class="outline-title">${escapeHtml(item.title)}</span>
        <span class="outline-active-icon">›</span>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  outlineList.querySelectorAll('.outline-item').forEach((item, idx) => {
    const toggle = item.querySelector('.outline-toggle');
    const itemLevel = parseInt(item.dataset.level);
    
    // Toggle collapse/expand when clicking the toggle button
    if (toggle && !toggle.classList.contains('hidden')) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        item.classList.toggle('collapsed');
        
        // Hide/show all children (items with higher level until same or lower level)
        let sibling = item.nextElementSibling;
        while (sibling) {
          const siblingLevel = parseInt(sibling.dataset.level);
          if (siblingLevel <= itemLevel) break;
          
          if (item.classList.contains('collapsed')) {
            sibling.classList.add('hidden-child');
          } else {
            sibling.classList.remove('hidden-child');
            // If this sibling is also collapsed, skip its children
            if (sibling.classList.contains('collapsed')) {
              let child = sibling.nextElementSibling;
              while (child && parseInt(child.dataset.level) > siblingLevel) {
                child = child.nextElementSibling;
              }
              sibling = child;
              continue;
            }
          }
          sibling = sibling.nextElementSibling;
        }
      });
    }
    
    // Navigate when clicking the item (not toggle)
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('outline-toggle')) return;
      
      const line = parseInt(item.dataset.line);
      const index = parseInt(item.dataset.index);
      const headingTitle = outlineItems[index]?.title || '';
      
      if (!isNaN(line) && editor) {
        // Remove active from all items, add to clicked
        outlineList.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Navigate to the heading in editor
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
        
        // Scroll PDF to the matching section
        scrollPdfToHeading(headingTitle, line, index);
      }
    });
  });
}

// Scroll PDF to the section matching the given heading title, index, and line
function scrollPdfToHeading(headingTitle, lineNumber, headingIndex) {
  if (totalPages === 0) return;

  // First, try to find matching item in PDF outline by title
  let matchingOutlineItem = findMatchingOutlineItem(headingTitle);

  // If no title match, try by index (same position in outline)
  if (!matchingOutlineItem && pdfOutline.length > 0 && headingIndex !== undefined) {
    // Match by index if outlines have similar structure
    if (headingIndex < pdfOutline.length) {
      matchingOutlineItem = pdfOutline[headingIndex];
    }
  }

  if (matchingOutlineItem && matchingOutlineItem.page) {
    // Use precise PDF outline navigation
    console.log('[Outline] Navigating to:', matchingOutlineItem.title, 'page:', matchingOutlineItem.page);
    scrollToPagePosition(matchingOutlineItem.page, matchingOutlineItem.top);
    return;
  }
  
  // Fallback: estimate page based on line position
  console.log('[Outline] Using fallback estimation for line:', lineNumber);
  if (editor) {
    const totalLines = editor.getModel().getLineCount();
    const estimatedPage = Math.max(1, Math.min(totalPages, Math.ceil((lineNumber / totalLines) * totalPages)));
    scrollToPagePosition(estimatedPage, null);
  }
}

// Find matching outline item by title (fuzzy match)
function findMatchingOutlineItem(headingTitle) {
  if (!pdfOutline || pdfOutline.length === 0) return null;
  
  // Normalize title for comparison
  const normalizeTitle = (t) => t.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedSearch = normalizeTitle(headingTitle);
  
  // Try exact match first
  let match = pdfOutline.find(item => normalizeTitle(item.title) === normalizedSearch);
  
  if (!match) {
    // Try partial match (heading contains or is contained in outline title)
    match = pdfOutline.find(item => {
      const normalizedItem = normalizeTitle(item.title);
      return normalizedItem.includes(normalizedSearch) || normalizedSearch.includes(normalizedItem);
    });
  }
  
  return match;
}

// Scroll to a specific page and optionally to a Y position within the page
function scrollToPagePosition(pageNum, topPosition) {
  const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
  
  if (pageWrapper) {
    const previewContent = document.getElementById('preview-content');
    
    if (topPosition !== null && currentPdfDoc) {
      // Calculate the actual scroll position based on the PDF coordinate
      // PDF coordinates are from bottom, we need to convert to top-based
      currentPdfDoc.getPage(pageNum).then(page => {
        const viewport = page.getViewport({ scale: currentZoom * 1.5 });
        const pageHeight = viewport.height;
        
        // Convert PDF coordinate (from bottom) to pixel offset (from top of page)
        const offsetFromTop = pageHeight - (topPosition * currentZoom * 1.5);
        
        // Get page wrapper's position
        const wrapperRect = pageWrapper.getBoundingClientRect();
        const containerRect = previewContent.getBoundingClientRect();
        const currentScroll = previewContent.scrollTop;
        
        // Calculate target scroll position
        const pageTop = pageWrapper.offsetTop;
        const targetScroll = pageTop + Math.max(0, offsetFromTop) - 80; // 80px padding to clear preview header
        
        previewContent.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      }).catch(() => {
        // Fallback to simple page scroll
        pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      // Just scroll to the page
      pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Update current page indicator
    currentPage = pageNum;
    updatePageInfo();
    
    // Add a highlight effect to the page
    pageWrapper.classList.add('highlight');
    setTimeout(() => pageWrapper.classList.remove('highlight'), 500);
  }
}

// Update outline (debounced)
function updateOutline() {
  if (!editor) return;
  
  clearTimeout(outlineUpdateTimer);
  outlineUpdateTimer = setTimeout(() => {
    const source = editor.getValue();
    outlineItems = parseOutline(source);
    renderOutline();
  }, 500);
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
  
  // Update outline
  updateOutline();

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
    
    // Run pagination validation if enabled
    if (autoValidate && currentPdfBuffer) {
      runPaginationValidation();
    }
  }
}

function setCompileStatus(status, error = "", diagnostics = []) {
  compileStatus = status;
  errorMessage = error;
  updateStatusBar();

  const errorWindow = document.getElementById("error-window");
  if (status === "error" && (error || diagnostics.length > 0)) {
    showErrorWindow(error, diagnostics);
    highlightErrorLines(diagnostics);
  } else {
    if (errorWindow) {
      errorWindow.classList.remove("visible");
    }
    clearErrorHighlights();
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

  // Get source code for code snippets
  const sourceCode = editor ? editor.getValue() : '';
  const sourceLines = sourceCode.split('\n');

  // Render diagnostics list
  const errorList = errorWindow.querySelector(".error-list");
  if (errorList) {
    errorList.innerHTML = diagnostics.map((d, index) => {
      const severityIcon = d.severity === "warning" ? icons.warning : icons.error;
      const severityClass = d.severity || "error";
      const location = formatErrorLocation(d);
      const hasLocation = d.line !== null;

      // Generate code snippet if we have line info
      const codeSnippet = generateCodeSnippet(d, sourceLines);

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
          ${codeSnippet}
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

// Generate a code snippet for an error diagnostic
function generateCodeSnippet(diagnostic, sourceLines) {
  if (diagnostic.line === null || diagnostic.line === undefined) return '';

  const errorLine = diagnostic.line;
  const startCol = diagnostic.column || 1;
  const endCol = diagnostic.endColumn || (startCol + 1);
  const endLine = diagnostic.endLine || errorLine;

  // Show context: 1 line before, error lines, 1 line after
  const contextBefore = 1;
  const contextAfter = 1;
  const startLineIdx = Math.max(0, errorLine - 1 - contextBefore);
  const endLineIdx = Math.min(sourceLines.length - 1, endLine - 1 + contextAfter);

  let snippetHtml = '<div class="error-code-snippet">';

  for (let i = startLineIdx; i <= endLineIdx; i++) {
    const lineNum = i + 1;
    const lineContent = sourceLines[i] || '';
    const isErrorLine = lineNum >= errorLine && lineNum <= endLine;
    const lineClass = isErrorLine ? 'error-line' : '';

    // Escape HTML in line content
    let displayContent = escapeHtml(lineContent) || ' '; // Use space for empty lines

    // Highlight the error portion on error lines
    if (isErrorLine && lineNum === errorLine && startCol > 0) {
      const before = escapeHtml(lineContent.substring(0, startCol - 1));
      const errorEnd = lineNum === endLine ? endCol : lineContent.length + 1;
      const errorPart = escapeHtml(lineContent.substring(startCol - 1, errorEnd - 1)) || ' ';
      const after = escapeHtml(lineContent.substring(errorEnd - 1));
      displayContent = `${before}<span class="error-highlight">${errorPart}</span>${after}`;
    }

    snippetHtml += `
      <div class="snippet-line ${lineClass}">
        <span class="snippet-line-num">${lineNum}</span>
        <span class="snippet-line-content">${displayContent}</span>
      </div>
    `;
  }

  // Add error indicator arrow
  if (startCol > 0) {
    const padding = ' '.repeat(startCol - 1);
    const underline = '^'.repeat(Math.max(1, endCol - startCol));
    snippetHtml += `
      <div class="snippet-indicator">
        <span class="snippet-line-num"></span>
        <span class="snippet-indicator-arrow">${padding}${underline}</span>
      </div>
    `;
  }

  snippetHtml += '</div>';
  return snippetHtml;
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
// ERROR LINE HIGHLIGHTING
// =====================
function highlightErrorLines(diagnostics) {
  console.log("[Main] highlightErrorLines called with:", JSON.stringify(diagnostics, null, 2));

  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  // Clear previous decorations
  clearErrorHighlights();

  // Create Monaco markers (squiggly underlines)
  const markers = diagnostics
    .filter(d => d.line !== null && d.line !== undefined)
    .map(d => {
      const startLine = d.line;
      const startCol = d.column || 1;
      // If we have end position, use it; otherwise mark to end of line
      const endLine = d.endLine || startLine;
      const endCol = d.endColumn || model.getLineMaxColumn(endLine);

      const marker = {
        severity: d.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Error,
        startLineNumber: startLine,
        startColumn: startCol,
        endLineNumber: endLine,
        endColumn: endCol,
        message: d.message || "Error",
        source: "typst"
      };

      console.log("[Main] Created marker:", marker);
      return marker;
    });

  console.log("[Main] Setting Monaco markers:", markers.length, "markers");

  // Set markers (shows squiggly underlines)
  monaco.editor.setModelMarkers(model, "typst", markers);

  // Also add line decorations for background highlighting
  const newDecorations = diagnostics
    .filter(d => d.line !== null && d.line !== undefined)
    .map(d => {
      const isWarning = d.severity === "warning";
      return {
        range: new monaco.Range(d.line, 1, d.line, 1),
        options: {
          isWholeLine: true,
          className: isWarning ? 'editor-line-warning' : 'editor-line-error',
          glyphMarginClassName: isWarning ? 'editor-glyph-warning' : 'editor-glyph-error',
          overviewRuler: {
            color: isWarning ? '#f59e0b' : '#ef4444',
            position: monaco.editor.OverviewRulerLane.Right
          }
        }
      };
    });

  // Apply line decorations
  errorDecorations = editor.deltaDecorations([], newDecorations);
}

function clearErrorHighlights() {
  if (!editor) return;

  // Clear Monaco markers
  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, "typst", []);
  }

  // Clear line decorations
  errorDecorations = editor.deltaDecorations(errorDecorations, []);
}

// =====================
// PDF RENDERING
// =====================
let currentPdfDoc = null;  // Store PDF document for outline navigation
let pdfOutline = [];       // Store PDF outline/bookmarks

async function renderPDF(buffer) {
  const container = document.getElementById("pdf-pages");
  container.innerHTML = "";

  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    currentPdfDoc = pdf;  // Store for later use
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

    // Extract PDF outline/bookmarks for navigation
    await extractPdfOutline(pdf);

    // Setup intersection observer for page tracking
    setupPageTracking();
  } catch (e) {
    console.error("PDF render error:", e);
    setCompileStatus("error", "Failed to render PDF: " + e.message);
  }
}

// Extract PDF outline/bookmarks for accurate navigation
async function extractPdfOutline(pdf) {
  try {
    const outline = await pdf.getOutline();
    pdfOutline = [];
    
    if (outline && outline.length > 0) {
      console.log('[PDF] Raw outline found:', outline.length, 'top-level items');
      // Process outline items recursively
      await processOutlineItems(pdf, outline, pdfOutline, 0);
      console.log('[PDF] Processed outline:', pdfOutline.map(i => `${i.title} -> p${i.page}`));
    } else {
      console.log('[PDF] No outline/bookmarks in PDF');
    }
  } catch (e) {
    console.warn('[PDF] Could not extract outline:', e);
    pdfOutline = [];
  }
}

// Process outline items recursively
async function processOutlineItems(pdf, items, result, level) {
  for (const item of items) {
    const outlineItem = {
      title: item.title,
      level: level,
      page: null,
      top: null
    };
    
    // Get the destination
    if (item.dest) {
      try {
        let dest = item.dest;
        // If dest is a string, resolve it
        if (typeof dest === 'string') {
          dest = await pdf.getDestination(dest);
        }
        
        if (dest && dest.length > 0) {
          // Get page index from destination reference
          const pageIndex = await pdf.getPageIndex(dest[0]);
          outlineItem.page = pageIndex + 1; // Convert to 1-based
          
          // Get Y position if available
          // For XYZ destinations: [pageRef, {name:"XYZ"}, left, top, zoom]
          // dest[3] is the Y coordinate (top position from bottom of page)
          if (dest.length > 3 && typeof dest[3] === 'number') {
            outlineItem.top = dest[3];
          }
        }
      } catch (e) {
        console.warn('[PDF] Could not resolve destination for:', item.title);
      }
    }
    
    result.push(outlineItem);
    
    // Process children
    if (item.items && item.items.length > 0) {
      await processOutlineItems(pdf, item.items, result, level + 1);
    }
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
          <button class="icon-btn sidebar-toggle" id="toggle-sidebar" title="Toggle Sidebar (Ctrl+B)">
            ${icons.sidebar}
          </button>
          <div class="logo">
            <div class="logo-icon-wrapper">
              <span class="logo-icon">${icons.fileTypst}</span>
            </div>
            <span class="logo-text">Typst<span class="logo-suffix">Playground</span></span>
          </div>
        </div>
        <div class="header-center">
          <div class="document-title-wrapper" id="doc-name">
            <span class="document-icon">${icons.fileTypst}</span>
            <span class="document-name-text">${currentFileName}</span>
            <span class="document-status" id="doc-status" title="All changes saved">
              ${icons.check}
            </span>
          </div>
        </div>
        <div class="header-right">
          <button class="header-action-btn" id="btn-templates" title="Browse Templates">
            ${icons.template}
            <span>Templates</span>
          </button>
          <div class="header-divider"></div>
          <div class="header-btn-group">
            <button class="icon-btn" id="btn-share" title="Share Document">
              ${icons.share}
            </button>
            <button class="icon-btn primary" id="btn-export" title="Download PDF">
              ${icons.download}
            </button>
          </div>
          <div class="header-divider"></div>
          <button class="icon-btn" id="btn-settings" title="Settings">
            ${icons.settings}
          </button>
          <button class="icon-btn" id="btn-help" title="Help & Keyboard Shortcuts (F1)">
            ${icons.help}
          </button>
        </div>
      </header>


      <!-- Main Content -->
      <div class="main-content">
        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-content">
            <!-- Documents Section -->
            <div class="sidebar-section">
              <div class="sidebar-section-header collapsible" id="documents-header" data-tooltip="Documents">
                <div class="section-title">
                  <span class="section-chevron">${icons.chevronDown}</span>
                  <span class="section-icon">${icons.folder}</span>
                  <span class="section-label">Documents</span>
                </div>
                <div class="sidebar-actions">
                  <button class="icon-btn tiny" id="btn-new-file" title="New Document">
                    ${icons.filePlus}
                  </button>
                </div>
              </div>
              <div class="file-tree" id="file-tree">
                <!-- Rendered dynamically by renderFileTree() -->
              </div>
            </div>

            <!-- Assets Section -->
            <div class="sidebar-section">
              <div class="sidebar-section-header collapsible" id="uploads-header" data-tooltip="Assets">
                <div class="section-title">
                  <span class="section-chevron">${icons.chevronDown}</span>
                  <span class="section-icon">${icons.image}</span>
                  <span class="section-label">Assets</span>
                </div>
                <div class="sidebar-actions">
                  <button class="icon-btn tiny" id="btn-upload" title="Upload Image or File">
                    ${icons.upload}
                  </button>
                </div>
              </div>
              <div class="uploads-list" id="uploads-list">
                <div class="empty-state" id="uploads-empty">
                  <span>Drop files here or click upload</span>
                </div>
              </div>
            </div>

            <!-- Fonts Section -->
            <div class="sidebar-section">
              <div class="sidebar-section-header collapsible" id="fonts-header" data-tooltip="Fonts">
                <div class="section-title">
                  <span class="section-chevron">${icons.chevronDown}</span>
                  <span class="section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
                    </svg>
                  </span>
                  <span class="section-label">Fonts</span>
                </div>
                <div class="sidebar-actions">
                  <button class="icon-btn tiny" id="btn-upload-font" title="Upload Custom Font">
                    ${icons.upload}
                  </button>
                </div>
              </div>
              <div class="fonts-list" id="fonts-list">
                <div class="empty-state" id="fonts-empty">
                  <span>Upload .ttf or .otf fonts</span>
                </div>
              </div>
            </div>

            <!-- Outline Section -->
            <div class="sidebar-section outline-section">
              <div class="sidebar-section-header collapsible" id="outline-header" data-tooltip="Outline">
                <div class="section-title">
                  <span class="section-chevron">${icons.chevronDown}</span>
                  <span class="section-icon">${icons.outline}</span>
                  <span class="section-label">Outline</span>
                </div>
                <div class="sidebar-actions">
                  <button class="icon-btn tiny" id="btn-refresh-outline" title="Refresh Outline">
                    ${icons.refresh}
                  </button>
                </div>
              </div>
              <div class="outline-list" id="outline-list">
                <div class="empty-state" id="outline-empty">
                  <span>No headings found</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sidebar Footer -->
          <div class="sidebar-footer">
            <button class="sidebar-collapse-btn" id="sidebar-collapse-btn" title="Collapse Sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="collapse-icon">
                <polyline points="11 17 6 12 11 7"></polyline>
                <polyline points="18 17 13 12 18 7"></polyline>
              </svg>
              <span class="collapse-text">Collapse</span>
            </button>
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

          <!-- Error Window (Console Panel) -->
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
              <button class="validation-indicator" id="validation-indicator" title="Pagination Validation">
                ${icons.validate} <span>Validate</span>
              </button>
              <span class="page-info" id="page-info">Page 1 of 1</span>
            </div>
          </div>
          <div class="preview-content" id="preview-content">
            <div class="pdf-container" id="pdf-pages"></div>
            <!-- Validation Panel -->
            <div class="validation-panel" id="validation-panel"></div>
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

  // Sidebar collapse
  document.getElementById("sidebar-collapse-btn").addEventListener("click", toggleSidebarCollapse);
  loadSidebarState();

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

  // Validation indicator
  document.getElementById("validation-indicator").addEventListener("click", (e) => {
    e.preventDefault();
    toggleValidationPanel();
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
  
  // Collapsible sidebar sections
  setupCollapsibleSections();
  
  // Outline refresh button
  document.getElementById("btn-refresh-outline").addEventListener("click", (e) => {
    e.stopPropagation();
    updateOutline();
    showToast("Outline refreshed");
  });
}

// =====================
// COLLAPSIBLE SECTIONS
// =====================
function setupCollapsibleSections() {
  // Handle all collapsible section headers
  const collapsibleHeaders = document.querySelectorAll('.sidebar-section-header.collapsible');
  
  collapsibleHeaders.forEach(header => {
    // Add click handler
    header.addEventListener('click', function(e) {
      // Don't collapse if clicking on action buttons
      if (e.target.closest('.sidebar-actions')) return;
      
      const section = this.closest('.sidebar-section');
      // Find the content list within this section
      const list = section.querySelector('.uploads-list, .fonts-list, .outline-list, .file-tree');
      
      if (list) {
        this.classList.toggle('collapsed');
        list.classList.toggle('collapsed');
        
        // Save state
        const sectionId = this.id;
        const isCollapsed = this.classList.contains('collapsed');
        localStorage.setItem(`section-${sectionId}`, isCollapsed ? 'collapsed' : 'expanded');
      }
    });
    
    // Restore saved state
    const sectionId = header.id;
    const savedState = localStorage.getItem(`section-${sectionId}`);
    if (savedState === 'collapsed') {
      header.classList.add('collapsed');
      const section = header.closest('.sidebar-section');
      const list = section.querySelector('.uploads-list, .fonts-list, .outline-list, .file-tree');
      if (list) list.classList.add('collapsed');
    }
  });
}

// =====================
// SIDEBAR
// =====================
let sidebarCollapsed = false;

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  const sidebar = document.getElementById("sidebar");
  const resizer = document.getElementById("sidebar-resizer");

  sidebar.style.display = sidebarVisible ? "flex" : "none";
  resizer.style.display = sidebarVisible ? "block" : "none";
}

function toggleSidebarCollapse() {
  sidebarCollapsed = !sidebarCollapsed;
  const sidebar = document.getElementById("sidebar");
  const collapseBtn = document.getElementById("sidebar-collapse-btn");

  if (sidebarCollapsed) {
    sidebar.classList.add("collapsed");
    collapseBtn.title = "Expand Sidebar";
  } else {
    sidebar.classList.remove("collapsed");
    collapseBtn.title = "Collapse Sidebar";
  }

  // Save preference
  localStorage.setItem("sidebar-collapsed", sidebarCollapsed);
}

// Load sidebar collapse state on init
function loadSidebarState() {
  const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  if (collapsed) {
    sidebarCollapsed = true;
    const sidebar = document.getElementById("sidebar");
    const collapseBtn = document.getElementById("sidebar-collapse-btn");
    if (sidebar) sidebar.classList.add("collapsed");
    if (collapseBtn) collapseBtn.title = "Expand Sidebar";
  }
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

        <div class="restart-tutorial-section">
          <button class="btn restart-tutorial-btn" id="restart-tutorial-btn">
            🎓 Restart Welcome Tour
          </button>
        </div>
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

    // Restart tutorial button
    const restartBtn = document.getElementById('restart-tutorial-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        closeModal();
        setTimeout(() => restartTutorial(), 300);
      });
    }
  }, 0);
}

// =====================
// PAGINATION VALIDATION
// =====================

// Initialize the pagination validator
function initPaginationValidator() {
  if (!paginationValidator) {
    paginationValidator = new PaginationValidator();
    // Load saved validation settings
    const savedRules = localStorage.getItem('validationRules');
    if (savedRules) {
      try {
        const rules = JSON.parse(savedRules);
        rules.forEach(rule => {
          paginationValidator.updateRule(rule.id, rule);
        });
      } catch (e) {
        console.warn('Failed to load saved validation rules:', e);
      }
    }
    const savedAutoValidate = localStorage.getItem('autoValidate');
    if (savedAutoValidate !== null) {
      autoValidate = savedAutoValidate === 'true';
    }
  }
  return paginationValidator;
}

// Run pagination validation on current PDF
async function runPaginationValidation() {
  if (!currentPdfBuffer) {
    console.log('[Validation] No PDF buffer available');
    return;
  }

  initPaginationValidator();
  
  console.log('[Validation] Starting validation...');
  updateValidationStatus('validating');
  
  try {
    // Pass a copy of the buffer since pdf.js may detach it
    validationResults = await paginationValidator.validate(new Uint8Array(currentPdfBuffer));
    console.log('[Validation] Results:', validationResults);
    
    updateValidationStatus(validationResults.valid ? 'valid' : 'invalid');
    updateValidationPanel();
  } catch (e) {
    console.error('[Validation] Error:', e);
    updateValidationStatus('error');
  }
}

// Update validation status indicator in UI
function updateValidationStatus(status) {
  const indicator = document.getElementById('validation-indicator');
  if (!indicator) return;

  indicator.className = 'validation-indicator';
  
  switch (status) {
    case 'validating':
      indicator.classList.add('validating');
      indicator.innerHTML = `${icons.loading} <span>Validating...</span>`;
      indicator.title = 'Running validation...';
      break;
    case 'valid':
      indicator.classList.add('valid');
      const passCount = validationResults?.passed || 0;
      indicator.innerHTML = `${icons.check} <span>${passCount} passed</span>`;
      indicator.title = 'All validation rules passed';
      break;
    case 'invalid':
      indicator.classList.add('invalid');
      const failCount = validationResults?.failed || 0;
      const warnCount = validationResults?.warnings || 0;
      let statusText = [];
      if (failCount > 0) statusText.push(`${failCount} failed`);
      if (warnCount > 0) statusText.push(`${warnCount} warnings`);
      indicator.innerHTML = `${icons.warning} <span>${statusText.join(', ')}</span>`;
      indicator.title = 'Click to see validation details';
      break;
    case 'error':
      indicator.classList.add('error');
      indicator.innerHTML = `${icons.error} <span>Error</span>`;
      indicator.title = 'Validation failed';
      break;
    default:
      indicator.innerHTML = `${icons.validate} <span>Validate</span>`;
      indicator.title = 'Run pagination validation';
  }
}

// Toggle validation panel visibility
function toggleValidationPanel() {
  validationPanelVisible = !validationPanelVisible;
  const panel = document.getElementById('validation-panel');
  if (panel) {
    panel.classList.toggle('visible', validationPanelVisible);
  }
  if (validationPanelVisible && !validationResults) {
    runPaginationValidation();
  }
}

// Update validation panel content
function updateValidationPanel() {
  const panel = document.getElementById('validation-panel');
  if (!panel || !validationResults) return;

  const { valid, totalRules, passed, failed, warnings, results, metadata } = validationResults;

  // Build results HTML
  const resultsHtml = results.map((result, index) => {
    const icon = result.status === 'pass' ? icons.check : 
                 result.status === 'warning' ? icons.warning : 
                 result.status === 'info' ? icons.info : icons.error;
    const statusClass = result.status;
    const hasPage = result.page !== null && result.page !== undefined;
    const pageInfo = hasPage ? ` (Page ${result.page})` : '';
    const clickableClass = hasPage ? 'clickable' : '';
    const dataPage = hasPage ? `data-page="${result.page}"` : '';
    const goToIcon = hasPage ? `<div class="validation-result-goto" title="Go to page ${result.page}">${icons.chevronRight}</div>` : '';
    
    return `
      <div class="validation-result ${statusClass} ${clickableClass}" ${dataPage} data-index="${index}">
        <div class="validation-result-icon">${icon}</div>
        <div class="validation-result-content">
          <div class="validation-result-title">${result.ruleName}${pageInfo}</div>
          <div class="validation-result-message">${result.message}</div>
        </div>
        ${goToIcon}
      </div>
    `;
  }).join('');

  // Build metadata HTML
  const metadataHtml = metadata ? `
    <div class="validation-metadata">
      <span class="metadata-item">${icons.file} ${metadata.pageCount} page${metadata.pageCount !== 1 ? 's' : ''}</span>
      ${metadata.pages?.[0] ? `<span class="metadata-item">${Math.round(metadata.pages[0].width)}×${Math.round(metadata.pages[0].height)} pt</span>` : ''}
    </div>
  ` : '';

  panel.innerHTML = `
    <div class="validation-panel-header" id="validation-panel-drag-handle" title="Drag to move • Double-click to reset position">
      <div class="validation-panel-drag-indicator">
        <span class="drag-dots"></span>
      </div>
      <div class="validation-panel-title">
        ${icons.validate}
        <span>Pagination Validation</span>
      </div>
      <div class="validation-panel-actions">
        <button class="icon-btn small" id="btn-validation-settings" title="Validation Settings">
          ${icons.settings}
        </button>
        <button class="icon-btn small" id="btn-validation-refresh" title="Re-run Validation">
          ${icons.refresh}
        </button>
        <button class="icon-btn small" id="btn-validation-close" title="Close">
          ${icons.close}
        </button>
      </div>
    </div>
    <div class="validation-panel-summary ${valid ? 'valid' : 'invalid'}">
      <div class="validation-summary-icon">${valid ? icons.check : icons.warning}</div>
      <div class="validation-summary-text">
        ${valid ? 'All validation rules passed' : `${failed} failed, ${warnings} warnings`}
      </div>
      <div class="validation-summary-counts">
        <span class="count-pass">${passed} passed</span>
        <span class="count-total">/ ${totalRules} rules</span>
      </div>
    </div>
    ${metadataHtml}
    <div class="validation-panel-results">
      ${resultsHtml}
    </div>
  `;

  // Setup event listeners
  document.getElementById('btn-validation-close')?.addEventListener('click', toggleValidationPanel);
  document.getElementById('btn-validation-refresh')?.addEventListener('click', runPaginationValidation);
  document.getElementById('btn-validation-settings')?.addEventListener('click', showValidationSettingsModal);

  // Setup click handlers for navigating to pages
  panel.querySelectorAll('.validation-result.clickable').forEach(item => {
    item.addEventListener('click', () => {
      const pageNum = parseInt(item.dataset.page, 10);
      const resultIndex = parseInt(item.dataset.index, 10);
      if (pageNum && pageNum > 0) {
        // Get the result details for this item
        const resultDetails = validationResults?.results?.[resultIndex]?.details || null;
        navigateToValidationPage(pageNum, resultDetails);
      }
    });
  });

  // Setup drag functionality
  setupValidationPanelDrag();
}

// Validation panel drag state
let validationPanelDragState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0
};

// Setup drag functionality for validation panel
function setupValidationPanelDrag() {
  const panel = document.getElementById('validation-panel');
  const dragHandle = document.getElementById('validation-panel-drag-handle');
  
  if (!panel || !dragHandle) return;

  // Double-click to reset position
  dragHandle.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    resetValidationPanelPosition();
    showToast('Panel position reset');
  });

  dragHandle.addEventListener('mousedown', (e) => {
    // Don't start drag if clicking on buttons
    if (e.target.closest('button')) return;
    
    e.preventDefault();
    
    validationPanelDragState.isDragging = true;
    validationPanelDragState.startX = e.clientX;
    validationPanelDragState.startY = e.clientY;
    
    // Get current position - use fixed positioning for full viewport movement
    const rect = panel.getBoundingClientRect();
    validationPanelDragState.startLeft = rect.left;
    validationPanelDragState.startTop = rect.top;
    
    // Switch to fixed positioning for free movement across entire app
    panel.style.position = 'fixed';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    
    // Add dragging class
    panel.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    
    // Add move and up listeners to document
    document.addEventListener('mousemove', handleValidationPanelDrag);
    document.addEventListener('mouseup', stopValidationPanelDrag);
  });
}

function handleValidationPanelDrag(e) {
  if (!validationPanelDragState.isDragging) return;
  
  e.preventDefault();
  
  const panel = document.getElementById('validation-panel');
  if (!panel) return;
  
  // Calculate new position
  const deltaX = e.clientX - validationPanelDragState.startX;
  const deltaY = e.clientY - validationPanelDragState.startY;
  
  let newLeft = validationPanelDragState.startLeft + deltaX;
  let newTop = validationPanelDragState.startTop + deltaY;
  
  // Get panel dimensions and viewport
  const panelRect = panel.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Constrain within viewport bounds (with some padding)
  const padding = 20;
  const minLeft = padding - panelRect.width + 100; // Allow some off-screen but keep handle visible
  const maxLeft = viewportWidth - 100; // Keep at least 100px visible
  const minTop = 48; // Below header
  const maxTop = viewportHeight - 100; // Keep at least 100px visible
  
  newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
  newTop = Math.max(minTop, Math.min(maxTop, newTop));
  
  // Apply position
  panel.style.left = `${newLeft}px`;
  panel.style.top = `${newTop}px`;
}

function stopValidationPanelDrag() {
  validationPanelDragState.isDragging = false;
  
  const panel = document.getElementById('validation-panel');
  if (panel) {
    panel.classList.remove('dragging');
  }
  
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  
  document.removeEventListener('mousemove', handleValidationPanelDrag);
  document.removeEventListener('mouseup', stopValidationPanelDrag);
}

// Reset validation panel position
function resetValidationPanelPosition() {
  const panel = document.getElementById('validation-panel');
  if (panel) {
    // Reset to absolute positioning within preview content
    panel.style.position = 'absolute';
    panel.style.left = '';
    panel.style.top = '56px';
    panel.style.right = '16px';
  }
}

// Navigate to a specific page from validation result
function navigateToValidationPage(pageNum, resultDetails = null) {
  const pageWrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
  
  if (pageWrapper) {
    // Scroll to the page
    pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Update current page indicator
    currentPage = pageNum;
    updatePageInfo();
    
    // Add a highlight effect to the page
    pageWrapper.classList.add('validation-highlight');
    setTimeout(() => pageWrapper.classList.remove('validation-highlight'), 1500);
    
    // Try to highlight matching text in editor if details contain lineText
    if (resultDetails?.lineText && editor) {
      highlightValidationTextInEditor(resultDetails.lineText);
    }
    
    // Show toast notification
    showToast(`Navigated to page ${pageNum}`);
  }
}

// Validation editor decorations
let validationDecorations = [];

// Highlight text in editor that matches validation result
function highlightValidationTextInEditor(searchText) {
  if (!editor || !searchText) return;
  
  // Clear previous validation highlights
  clearValidationHighlights();
  
  const source = editor.getValue();
  const lines = source.split('\n');
  
  // Clean up search text - remove ellipsis and extra whitespace
  const cleanText = searchText.replace(/\.{3}$/, '').trim();
  
  if (cleanText.length < 3) return; // Too short to search meaningfully
  
  // Find lines containing the text
  const matchingLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line contains the search text (case-insensitive partial match)
    if (line.toLowerCase().includes(cleanText.toLowerCase().substring(0, Math.min(20, cleanText.length)))) {
      matchingLines.push({
        lineNumber: i + 1,
        line: line
      });
    }
  }
  
  if (matchingLines.length > 0) {
    // Highlight the first match
    const firstMatch = matchingLines[0];
    
    // Create decoration
    validationDecorations = editor.deltaDecorations([], [
      {
        range: new monaco.Range(firstMatch.lineNumber, 1, firstMatch.lineNumber, firstMatch.line.length + 1),
        options: {
          isWholeLine: true,
          className: 'editor-line-validation',
          glyphMarginClassName: 'editor-glyph-validation',
          overviewRuler: {
            color: 'rgba(34, 211, 238, 0.7)',
            position: monaco.editor.OverviewRulerLane.Right
          }
        }
      }
    ]);
    
    // Scroll to the line in editor
    editor.revealLineInCenter(firstMatch.lineNumber);
    
    // Auto-clear highlight after a delay
    setTimeout(clearValidationHighlights, 5000);
  }
}

// Clear validation highlights from editor
function clearValidationHighlights() {
  if (editor && validationDecorations.length > 0) {
    validationDecorations = editor.deltaDecorations(validationDecorations, []);
  }
}

// Show validation settings modal
function showValidationSettingsModal() {
  initPaginationValidator();
  const rules = paginationValidator.getRules();
  const pageSizes = getAvailablePageSizes();

  const rulesHtml = rules.map(rule => {
    const configInputs = getConfigInputsForRule(rule);
    return `
      <div class="validation-rule-item">
        <div class="validation-rule-header">
          <label class="validation-rule-toggle">
            <input type="checkbox" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
            <span class="validation-rule-name">${rule.name}</span>
          </label>
          <select class="validation-severity-select" data-severity-rule="${rule.id}">
            <option value="error" ${rule.severity === 'error' ? 'selected' : ''}>Error</option>
            <option value="warning" ${rule.severity === 'warning' ? 'selected' : ''}>Warning</option>
            <option value="info" ${rule.severity === 'info' ? 'selected' : ''}>Info</option>
          </select>
        </div>
        <div class="validation-rule-description">${rule.description}</div>
        ${configInputs ? `<div class="validation-rule-config">${configInputs}</div>` : ''}
      </div>
    `;
  }).join('');

  const content = `
    <div class="validation-settings">
      <div class="validation-settings-header">
        <label class="auto-validate-toggle">
          <input type="checkbox" id="auto-validate-checkbox" ${autoValidate ? 'checked' : ''}>
          <span>Auto-validate after compilation</span>
        </label>
      </div>
      <div class="validation-rules-list">
        <h4>Validation Rules</h4>
        ${rulesHtml}
      </div>
      <div class="validation-settings-actions">
        <button class="btn secondary" id="btn-reset-validation-rules">Reset to Defaults</button>
        <button class="btn primary" id="btn-save-validation-rules">Save Settings</button>
      </div>
    </div>
  `;

  showModal('Pagination Validation Settings', content, 'large');

  // Setup event listeners after modal is shown
  setTimeout(() => {
    // Auto-validate toggle
    document.getElementById('auto-validate-checkbox')?.addEventListener('change', (e) => {
      autoValidate = e.target.checked;
    });

    // Rule toggles
    document.querySelectorAll('[data-rule-id]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const ruleId = e.target.dataset.ruleId;
        paginationValidator.setRuleEnabled(ruleId, e.target.checked);
      });
    });

    // Severity selects
    document.querySelectorAll('[data-severity-rule]').forEach(select => {
      select.addEventListener('change', (e) => {
        const ruleId = e.target.dataset.severityRule;
        const severity = e.target.value;
        paginationValidator.updateRule(ruleId, { severity });
      });
    });

    // Config inputs
    document.querySelectorAll('[data-config-rule]').forEach(input => {
      input.addEventListener('change', (e) => {
        const ruleId = e.target.dataset.configRule;
        const configKey = e.target.dataset.configKey;
        let value = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
        if (e.target.type === 'checkbox') value = e.target.checked;
        paginationValidator.setRuleConfig(ruleId, { [configKey]: value });
      });
    });

    // Reset button
    document.getElementById('btn-reset-validation-rules')?.addEventListener('click', () => {
      paginationValidator.resetRules();
      localStorage.removeItem('validationRules');
      autoValidate = true;
      localStorage.setItem('autoValidate', 'true');
      closeModal();
      showToast('Validation rules reset to defaults');
    });

    // Save button
    document.getElementById('btn-save-validation-rules')?.addEventListener('click', () => {
      const rules = paginationValidator.getRules();
      localStorage.setItem('validationRules', JSON.stringify(rules));
      localStorage.setItem('autoValidate', String(autoValidate));
      closeModal();
      showToast('Validation settings saved');
      // Re-run validation with new settings
      if (currentPdfBuffer) {
        runPaginationValidation();
      }
    });
  }, 0);
}

// Generate config inputs HTML for a rule
function getConfigInputsForRule(rule) {
  const config = rule.config;
  if (!config || Object.keys(config).length === 0) return '';

  const inputs = [];
  const pageSizes = getAvailablePageSizes();

  for (const [key, value] of Object.entries(config)) {
    let input = '';
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    
    if (key === 'expectedSize') {
      input = `
        <label>
          <span>${label}</span>
          <select data-config-rule="${rule.id}" data-config-key="${key}">
            ${pageSizes.map(size => `<option value="${size}" ${value === size ? 'selected' : ''}>${size}</option>`).join('')}
            <option value="custom" ${value === 'custom' ? 'selected' : ''}>Custom</option>
          </select>
        </label>
      `;
    } else if (typeof value === 'boolean') {
      input = `
        <label class="config-checkbox">
          <input type="checkbox" data-config-rule="${rule.id}" data-config-key="${key}" ${value ? 'checked' : ''}>
          <span>${label}</span>
        </label>
      `;
    } else if (typeof value === 'number') {
      input = `
        <label>
          <span>${label}</span>
          <input type="number" data-config-rule="${rule.id}" data-config-key="${key}" value="${value}" min="0" step="1">
        </label>
      `;
    }
    
    if (input) inputs.push(input);
  }

  return inputs.join('');
}

// =====================
// ONBOARDING TUTORIAL
// =====================
const tutorialSteps = [
  {
    title: "Welcome to Typst Playground! 👋",
    content: "Let's take a quick tour of the editor. This will only take a minute!",
    target: null, // No highlight for welcome
    position: "center"
  },
  {
    title: "Code Editor",
    content: "Write your Typst code here. The editor features syntax highlighting, autocomplete, and line numbers.",
    target: "#monaco-editor",
    position: "right"
  },
  {
    title: "Live Preview",
    content: "Your document compiles automatically as you type! See the PDF preview update in real-time.",
    target: "#pdf-container",
    position: "left"
  },
  {
    title: "Sidebar",
    content: "Manage your files, uploaded images, and custom fonts here. Toggle it with Ctrl+B.",
    target: ".sidebar",
    position: "right"
  },
  {
    title: "Templates",
    content: "Start quickly with pre-made templates for articles, letters, resumes, and more!",
    target: "#btn-templates",
    position: "bottom"
  },
  {
    title: "Upload Files",
    content: "Upload images and assets by clicking here or dragging files to the Uploads section.",
    target: "#btn-upload",
    position: "bottom"
  },
  {
    title: "Custom Fonts",
    content: "Upload your own fonts (TTF, OTF, WOFF) to use in your documents.",
    target: "#btn-upload-font",
    position: "bottom"
  },
  {
    title: "Export PDF",
    content: "When you're ready, download your document as a PDF file.",
    target: "#btn-export",
    position: "bottom"
  },
  {
    title: "Share Your Work",
    content: "Generate a shareable link so others can view or remix your document.",
    target: "#btn-share",
    position: "bottom"
  },
  {
    title: "Zoom Controls",
    content: "Zoom in/out of the preview using these controls or Ctrl+/Ctrl-",
    target: ".zoom-controls",
    position: "top"
  },
  {
    title: "Autocomplete",
    content: "Press Ctrl+Space to see suggestions for functions, fonts, colors, and more!",
    target: null,
    position: "center"
  },
  {
    title: "You're All Set! 🎉",
    content: "Start writing your document! Click Help (?) anytime for more guidance. Happy writing!",
    target: null,
    position: "center"
  }
];

let currentTutorialStep = 0;
let tutorialOverlay = null;

function startOnboardingTutorial() {
  currentTutorialStep = 0;
  createTutorialOverlay();
  showTutorialStep(0);
}

function createTutorialOverlay() {
  // Remove existing overlay if any
  if (tutorialOverlay) {
    tutorialOverlay.remove();
  }

  tutorialOverlay = document.createElement('div');
  tutorialOverlay.className = 'tutorial-overlay';
  tutorialOverlay.innerHTML = `
    <div class="tutorial-backdrop"></div>
    <div class="tutorial-highlight"></div>
    <div class="tutorial-tooltip">
      <div class="tutorial-progress">
        <span class="tutorial-step-indicator"></span>
      </div>
      <h3 class="tutorial-title"></h3>
      <p class="tutorial-content"></p>
      <div class="tutorial-actions">
        <button class="tutorial-btn tutorial-skip">Skip Tour</button>
        <div class="tutorial-nav">
          <button class="tutorial-btn tutorial-prev">← Back</button>
          <button class="tutorial-btn tutorial-next primary">Next →</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(tutorialOverlay);

  // Event listeners
  tutorialOverlay.querySelector('.tutorial-skip').addEventListener('click', endTutorial);
  tutorialOverlay.querySelector('.tutorial-prev').addEventListener('click', () => navigateTutorial(-1));
  tutorialOverlay.querySelector('.tutorial-next').addEventListener('click', () => navigateTutorial(1));

  // Close on backdrop click
  tutorialOverlay.querySelector('.tutorial-backdrop').addEventListener('click', endTutorial);

  // Keyboard navigation
  document.addEventListener('keydown', handleTutorialKeydown);
}

function handleTutorialKeydown(e) {
  if (!tutorialOverlay) return;

  if (e.key === 'Escape') {
    endTutorial();
  } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
    navigateTutorial(1);
  } else if (e.key === 'ArrowLeft') {
    navigateTutorial(-1);
  }
}

function showTutorialStep(stepIndex) {
  if (!tutorialOverlay || stepIndex < 0 || stepIndex >= tutorialSteps.length) return;

  const step = tutorialSteps[stepIndex];
  const tooltip = tutorialOverlay.querySelector('.tutorial-tooltip');
  const highlight = tutorialOverlay.querySelector('.tutorial-highlight');
  const title = tutorialOverlay.querySelector('.tutorial-title');
  const content = tutorialOverlay.querySelector('.tutorial-content');
  const prevBtn = tutorialOverlay.querySelector('.tutorial-prev');
  const nextBtn = tutorialOverlay.querySelector('.tutorial-next');
  const stepIndicator = tutorialOverlay.querySelector('.tutorial-step-indicator');

  // Update content
  title.textContent = step.title;
  content.textContent = step.content;

  // Update progress indicator
  stepIndicator.textContent = `${stepIndex + 1} of ${tutorialSteps.length}`;

  // Update navigation buttons
  prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
  nextBtn.textContent = stepIndex === tutorialSteps.length - 1 ? "Let's Go! 🚀" : 'Next →';

  // Position tooltip and highlight
  if (step.target) {
    const targetEl = document.querySelector(step.target);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();

      // Show and position highlight
      highlight.style.display = 'block';
      highlight.style.top = `${rect.top - 4}px`;
      highlight.style.left = `${rect.left - 4}px`;
      highlight.style.width = `${rect.width + 8}px`;
      highlight.style.height = `${rect.height + 8}px`;

      // Position tooltip based on position preference
      tooltip.className = 'tutorial-tooltip';
      tooltip.classList.add(`position-${step.position}`);

      positionTooltip(tooltip, rect, step.position);
    } else {
      // Target not found, center the tooltip
      highlight.style.display = 'none';
      tooltip.className = 'tutorial-tooltip position-center';
      centerTooltip(tooltip);
    }
  } else {
    // No target, center everything
    highlight.style.display = 'none';
    tooltip.className = 'tutorial-tooltip position-center';
    centerTooltip(tooltip);
  }

  // Add entrance animation
  tooltip.classList.add('animate');
  setTimeout(() => tooltip.classList.remove('animate'), 300);
}

function positionTooltip(tooltip, targetRect, position) {
  const tooltipRect = tooltip.getBoundingClientRect();
  const padding = 16;
  const arrowOffset = 12;

  let top, left;

  switch (position) {
    case 'top':
      top = targetRect.top - tooltipRect.height - padding - arrowOffset;
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      break;
    case 'bottom':
      top = targetRect.bottom + padding + arrowOffset;
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      break;
    case 'left':
      top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
      left = targetRect.left - tooltipRect.width - padding - arrowOffset;
      break;
    case 'right':
      top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
      left = targetRect.right + padding + arrowOffset;
      break;
    default:
      centerTooltip(tooltip);
      return;
  }

  // Keep tooltip within viewport
  const viewportPadding = 20;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding));
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.transform = 'none';
}

function centerTooltip(tooltip) {
  tooltip.style.top = '50%';
  tooltip.style.left = '50%';
  tooltip.style.transform = 'translate(-50%, -50%)';
}

function navigateTutorial(direction) {
  const newStep = currentTutorialStep + direction;

  if (newStep >= tutorialSteps.length) {
    endTutorial();
    return;
  }

  if (newStep >= 0 && newStep < tutorialSteps.length) {
    currentTutorialStep = newStep;
    showTutorialStep(currentTutorialStep);
  }
}

function endTutorial() {
  if (tutorialOverlay) {
    tutorialOverlay.classList.add('fade-out');
    setTimeout(() => {
      tutorialOverlay.remove();
      tutorialOverlay = null;
    }, 300);
  }

  document.removeEventListener('keydown', handleTutorialKeydown);
  localStorage.setItem('tutorialCompleted', 'true');

  showToast("Tutorial completed! Click Help (?) anytime for more info.");
}

// Function to restart tutorial (can be called from settings or help)
function restartTutorial() {
  localStorage.removeItem('tutorialCompleted');
  startOnboardingTutorial();
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
    { path: "0.png", url: "/assets/0.png" },
    { path: "1.png", url: "/assets/1.png" },
    { path: "2.jpg", url: "/assets/2.jpg" },
    { path: "3.jpg", url: "/assets/3.jpg" },
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

    /* Light theme error highlighting */
    [data-theme="light"] .editor-line-error {
      background: rgba(220, 38, 38, 0.12) !important;
    }

    [data-theme="light"] .editor-line-warning {
      background: rgba(217, 119, 6, 0.12) !important;
    }

    [data-theme="light"] .editor-line-validation {
      background: rgba(8, 145, 178, 0.12) !important;
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
      background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
      gap: 16px;
    }

    .header-left, .header-center, .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left {
      flex: 0 0 auto;
    }

    .header-center {
      flex: 1;
      justify-content: center;
    }

    .header-right {
      flex: 0 0 auto;
      justify-content: flex-end;
    }

    .header-btn-group {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--bg-tertiary);
      border-radius: 10px;
      padding: 4px;
      border: 1px solid var(--border-color);
    }

    .header-btn-group .icon-btn {
      border-radius: 8px;
    }

    .header-btn-group .icon-btn.primary {
      background: var(--accent);
      color: var(--bg-primary);
    }

    .header-btn-group .icon-btn.primary:hover {
      background: var(--accent-hover);
    }

    .header-divider {
      width: 1px;
      height: 24px;
      background: var(--border-color);
      margin: 0 4px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-primary);
      font-weight: 700;
      font-size: 15px;
    }

    .logo-icon-wrapper {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--accent) 0%, #6366f1 100%);
      border-radius: 8px;
      padding: 5px;
    }

    .logo-icon {
      width: 100%;
      height: 100%;
      display: flex;
      color: white;
    }

    .logo-icon svg {
      width: 100%;
      height: 100%;
    }

    .logo-text {
      display: flex;
      align-items: baseline;
      gap: 2px;
    }

    .logo-suffix {
      color: var(--text-muted);
      font-weight: 400;
      font-size: 13px;
    }

    .sidebar-toggle {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
    }

    /* Document Title */
    .document-title-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      max-width: 300px;
      cursor: default;
    }

    .document-icon {
      width: 16px;
      height: 16px;
      color: var(--accent);
      flex-shrink: 0;
    }

    .document-icon svg {
      width: 100%;
      height: 100%;
    }

    .document-name-text {
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .document-status {
      width: 16px;
      height: 16px;
      color: var(--success);
      flex-shrink: 0;
    }

    .document-status svg {
      width: 100%;
      height: 100%;
    }

    /* Header Action Button */
    .header-action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
    }

    .header-action-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--accent);
    }

    .header-action-btn svg {
      width: 16px;
      height: 16px;
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

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .sidebar-section {
      margin-bottom: 4px;
    }

    .sidebar-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      margin: 0 8px;
      border-radius: 8px;
      transition: background 0.15s;
    }

    .sidebar-section-header:hover {
      background: var(--bg-hover);
    }

    .sidebar-section-header.collapsible {
      cursor: pointer;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .section-icon {
      width: 16px;
      height: 16px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .section-icon svg {
      width: 100%;
      height: 100%;
    }

    .section-chevron {
      width: 14px;
      height: 14px;
      color: var(--text-muted);
      transition: transform 0.2s;
    }

    .section-chevron svg {
      width: 100%;
      height: 100%;
    }

    .sidebar-section-header.collapsed .section-chevron {
      transform: rotate(-90deg);
    }

    .sidebar-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .sidebar-section-header:hover .sidebar-actions {
      opacity: 1;
    }

    .icon-btn.tiny {
      width: 22px;
      height: 22px;
      border-radius: 6px;
    }

    .icon-btn.tiny svg {
      width: 12px;
      height: 12px;
    }

    .file-tree, .uploads-list, .fonts-list {
      padding: 4px 12px;
    }

    .uploads-list, .fonts-list {
      min-height: 40px;
      transition: all 0.2s;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 8px;
      color: var(--text-muted);
      font-size: 11px;
      text-align: center;
      border: 1px dashed var(--border-color);
      border-radius: 8px;
      margin: 4px 0;
    }

    /* Sidebar Footer */
    .sidebar-footer {
      padding: 12px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-tertiary);
    }

    .sidebar-footer-info {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .storage-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .storage-dot {
      width: 6px;
      height: 6px;
      background: var(--success);
      border-radius: 50%;
    }

    /* Sidebar Collapse Button */
    .sidebar-collapse-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .sidebar-collapse-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .sidebar-collapse-btn .collapse-icon {
      width: 14px;
      height: 14px;
      transition: transform 0.2s;
    }

    /* Collapsed Sidebar State */
    .sidebar.collapsed {
      width: 48px !important;
      min-width: 48px;
    }

    .sidebar.collapsed .sidebar-content {
      padding: 8px 4px;
    }

    .sidebar.collapsed .sidebar-section-header {
      justify-content: center;
      padding: 8px;
    }

    .sidebar.collapsed .section-title {
      justify-content: center;
    }

    .sidebar.collapsed .section-label {
      display: none;
    }

    .sidebar.collapsed .section-chevron {
      display: none;
    }

    .sidebar.collapsed .sidebar-actions {
      display: none;
    }

    .sidebar.collapsed .file-tree,
    .sidebar.collapsed .uploads-list,
    .sidebar.collapsed .fonts-list,
    .sidebar.collapsed .outline-list {
      display: none;
    }

    .sidebar.collapsed .sidebar-footer {
      padding: 8px;
    }

    .sidebar.collapsed .sidebar-collapse-btn {
      padding: 8px;
      border: none;
    }

    .sidebar.collapsed .sidebar-collapse-btn .collapse-text {
      display: none;
    }

    .sidebar.collapsed .sidebar-collapse-btn .collapse-icon {
      transform: rotate(180deg);
    }

    .sidebar.collapsed .section-icon {
      margin: 0;
    }

    .sidebar.collapsed .section-icon svg {
      width: 18px;
      height: 18px;
    }

    /* Tooltip for collapsed icons */
    .sidebar.collapsed .sidebar-section-header {
      position: relative;
    }

    .sidebar.collapsed .sidebar-section-header::after {
      content: attr(data-tooltip);
      position: absolute;
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      margin-left: 8px;
      padding: 6px 10px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 12px;
      color: var(--text-primary);
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .sidebar.collapsed .sidebar-section-header:hover::after {
      opacity: 1;
      visibility: visible;
    }

    /* Legacy support */
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
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.15s;
      margin-bottom: 2px;
    }

    .file-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .file-item.active {
      background: var(--accent-muted);
      color: var(--accent);
      border-left: 3px solid var(--accent);
    }

    .file-icon {
      width: 16px;
      height: 16px;
      display: flex;
      flex-shrink: 0;
      color: inherit;
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
      font-weight: 500;
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

    /* Outline Section */
    .outline-list {
      padding: 6px 6px 6px 8px;
      max-height: 300px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    
    .outline-list.collapsed,
    .uploads-list.collapsed,
    .fonts-list.collapsed,
    .file-tree.collapsed {
      display: none;
    }
    
    .outline-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.15s ease;
      font-size: 12px;
      line-height: 1.4;
      background: transparent;
    }
    
    .outline-item.hidden-child {
      display: none;
    }
    
    .outline-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .outline-item.active {
      background: var(--accent-muted);
      color: var(--text-primary);
    }
    
    .outline-item.level-1 {
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .outline-item.level-2 {
      font-weight: 500;
    }
    
    .outline-item.level-3,
    .outline-item.level-4,
    .outline-item.level-5,
    .outline-item.level-6 {
      font-weight: 400;
      font-size: 11px;
    }
    
    .outline-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      font-size: 12px;
      color: var(--text-primary);
      flex-shrink: 0;
      transition: transform 0.15s ease, background 0.15s ease;
      border-radius: 4px;
      background: var(--bg-tertiary);
    }
    
    .outline-toggle:hover {
      background: var(--accent-muted);
      color: var(--accent);
    }
    
    .outline-toggle.hidden {
      background: transparent;
      visibility: hidden;
    }
    
    .outline-item.collapsed .outline-toggle {
      transform: rotate(0deg);
    }
    
    .outline-item:not(.collapsed) .outline-toggle:not(.hidden) {
      transform: rotate(90deg);
    }
    
    .outline-item.level-1 .outline-toggle {
      background: var(--accent);
      color: white;
    }
    
    .outline-item.level-1 .outline-toggle:hover {
      background: var(--accent-hover);
      color: white;
    }
    
    .outline-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .outline-active-icon {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent);
      opacity: 0;
      transition: opacity 0.15s ease;
      margin-left: auto;
    }
    
    .outline-item.active .outline-active-icon {
      opacity: 1;
    }
    
    .outline-section .empty-state {
      padding: 16px 8px;
      text-align: center;
      color: var(--text-muted);
      font-size: 11px;
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
      gap: 8px;
      padding: 8px 14px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      border: none;
      border-radius: 8px 0 0 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.15s ease;
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.25);
    }

    .recompile-btn:hover {
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
      transform: translateY(-1px);
    }

    .recompile-btn svg {
      width: 14px;
      height: 14px;
    }

    .recompile-dropdown-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 8px;
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: white;
      border: none;
      border-left: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0 8px 8px 0;
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
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 3px;
      gap: 0;
    }

    .mode-toggle-bg {
      position: absolute;
      top: 3px;
      left: 3px;
      width: calc(50% - 3px);
      height: calc(100% - 6px);
      background: linear-gradient(135deg, var(--accent) 0%, #6366f1 100%);
      border-radius: 8px;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px rgba(34, 211, 238, 0.25);
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
      color: var(--text-muted);
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: color 0.2s ease;
      position: relative;
      z-index: 1;
      flex: 1;
      white-space: nowrap;
    }

    .mode-toggle-btn svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .mode-toggle-btn:hover {
      color: var(--text-secondary);
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
      padding: 4px 12px;
      height: 42px;
      flex-shrink: 0;
      gap: 12px;
    }

    .editor-tabs-left {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }

    .editor-tabs-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--border-color);
      transition: all 0.15s;
    }

    .tab:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .tab.active {
      background: var(--accent-muted);
      color: var(--accent);
      border-color: var(--accent);
    }

    .tab-icon {
      width: 14px;
      height: 14px;
      display: flex;
      color: inherit;
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
      padding: 6px 12px;
      height: 42px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .preview-toolbar-left, .preview-toolbar-center, .preview-toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .preview-toolbar-center {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 4px;
    }

    .preview-title {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .zoom-level, .zoom-level-btn {
      font-size: 12px;
      color: var(--text-secondary);
      min-width: 50px;
      text-align: center;
    }

    .zoom-level-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 6px;
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

    /* Validation Indicator */
    .validation-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      transition: all 0.2s ease;
    }

    .validation-indicator:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
    }

    .validation-indicator .icon {
      width: 14px;
      height: 14px;
    }

    .validation-indicator.validating {
      color: var(--accent);
      border-color: var(--accent);
    }

    .validation-indicator.validating .icon {
      animation: spin 1s linear infinite;
    }

    .validation-indicator.valid {
      color: var(--success);
      border-color: var(--success);
      background: rgba(74, 222, 128, 0.1);
    }

    .validation-indicator.invalid {
      color: var(--warning);
      border-color: var(--warning);
      background: rgba(251, 191, 36, 0.1);
    }

    .validation-indicator.error {
      color: var(--error);
      border-color: var(--error);
      background: rgba(248, 113, 113, 0.1);
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Validation Panel */
    .validation-panel {
      position: absolute;
      right: 16px;
      top: 56px;
      width: 380px;
      max-height: calc(100vh - 200px);
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 100;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }

    .validation-panel.visible {
      display: flex;
    }

    .validation-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      cursor: grab;
      border-radius: 12px 12px 0 0;
      user-select: none;
    }

    .validation-panel-header:active {
      cursor: grabbing;
    }

    .validation-panel.dragging {
      opacity: 0.95;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
      z-index: 10000;
    }

    .validation-panel[style*="position: fixed"] {
      z-index: 1000;
    }

    .validation-panel.dragging .validation-panel-header {
      cursor: grabbing;
    }

    .validation-panel-drag-indicator {
      display: flex;
      align-items: center;
      margin-right: 8px;
    }

    .drag-dots {
      display: block;
      width: 8px;
      height: 14px;
      background-image: radial-gradient(circle, var(--text-muted) 1.5px, transparent 1.5px);
      background-size: 4px 4px;
      opacity: 0.6;
      transition: opacity 0.2s ease;
    }

    .validation-panel-header:hover .drag-dots {
      opacity: 1;
    }

    .validation-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary);
    }

    .validation-panel-title .icon {
      width: 16px;
      height: 16px;
      color: var(--accent);
    }

    .validation-panel-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .validation-panel-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .validation-panel-summary.valid {
      background: rgba(74, 222, 128, 0.1);
    }

    .validation-panel-summary.invalid {
      background: rgba(251, 191, 36, 0.1);
    }

    .validation-summary-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .validation-panel-summary.valid .validation-summary-icon {
      color: var(--success);
    }

    .validation-panel-summary.invalid .validation-summary-icon {
      color: var(--warning);
    }

    .validation-summary-text {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .validation-summary-counts {
      font-size: 11px;
      color: var(--text-muted);
    }

    .validation-summary-counts .count-pass {
      color: var(--success);
    }

    .validation-metadata {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-tertiary);
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .metadata-item .icon {
      width: 12px;
      height: 12px;
    }

    .validation-panel-results {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .validation-result {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      margin-bottom: 4px;
      background: var(--bg-tertiary);
      border-left: 3px solid transparent;
      transition: all 0.2s ease;
    }

    .validation-result.clickable {
      cursor: pointer;
    }

    .validation-result.clickable:hover {
      background: var(--bg-hover);
      transform: translateX(2px);
    }

    .validation-result.clickable:active {
      transform: translateX(4px);
    }

    .validation-result.pass {
      border-left-color: var(--success);
    }

    .validation-result.fail {
      border-left-color: var(--error);
      background: rgba(248, 113, 113, 0.05);
    }

    .validation-result.fail.clickable:hover {
      background: rgba(248, 113, 113, 0.12);
    }

    .validation-result.warning {
      border-left-color: var(--warning);
      background: rgba(251, 191, 36, 0.05);
    }

    .validation-result.warning.clickable:hover {
      background: rgba(251, 191, 36, 0.12);
    }

    .validation-result.info {
      border-left-color: var(--accent);
    }

    .validation-result-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .validation-result.pass .validation-result-icon {
      color: var(--success);
    }

    .validation-result.fail .validation-result-icon {
      color: var(--error);
    }

    .validation-result.warning .validation-result-icon {
      color: var(--warning);
    }

    .validation-result.info .validation-result-icon {
      color: var(--accent);
    }

    .validation-result-content {
      flex: 1;
      min-width: 0;
    }

    .validation-result-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 2px;
    }

    .validation-result-message {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.4;
      word-break: break-word;
    }

    .validation-result-goto {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: var(--text-muted);
      opacity: 0;
      transition: opacity 0.2s ease, color 0.2s ease;
      align-self: center;
    }

    .validation-result.clickable:hover .validation-result-goto {
      opacity: 1;
      color: var(--accent);
    }

    /* Page highlight effect when navigating from validation */
    .pdf-page-wrapper.validation-highlight {
      animation: validation-pulse 1.5s ease-out;
    }

    @keyframes validation-pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4);
      }
      50% {
        box-shadow: 0 0 0 8px rgba(34, 211, 238, 0.2);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(34, 211, 238, 0);
      }
    }

    /* Validation Settings Modal */
    .validation-settings {
      padding: 16px;
    }

    .validation-settings-header {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .auto-validate-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-size: 14px;
      color: var(--text-primary);
    }

    .validation-rules-list h4 {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .validation-rule-item {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }

    .validation-rule-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .validation-rule-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .validation-rule-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .validation-severity-select {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      background: var(--bg-secondary);
      color: var(--text-primary);
      cursor: pointer;
      font-weight: 500;
      text-transform: capitalize;
    }

    .validation-severity-select:focus {
      outline: none;
      border-color: var(--accent);
    }

    .validation-severity-select option[value="error"] {
      color: var(--error);
    }

    .validation-severity-select option[value="warning"] {
      color: var(--warning);
    }

    .validation-severity-select option[value="info"] {
      color: var(--accent);
    }

    .validation-rule-description {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .validation-rule-config {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--border-color);
    }

    .validation-rule-config label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .validation-rule-config label.config-checkbox {
      flex-direction: row;
      align-items: center;
      gap: 6px;
    }

    .validation-rule-config input[type="number"],
    .validation-rule-config select {
      padding: 4px 8px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 12px;
      width: 100px;
    }

    .validation-settings-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .preview-content {
      flex: 1;
      overflow: auto;
      background: #404040;
      position: relative;
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
      transition: box-shadow 0.3s, transform 0.3s;
    }
    
    .pdf-page-wrapper.highlight {
      box-shadow: 0 0 0 3px var(--accent), 0 4px 20px rgba(0, 0, 0, 0.4);
      transform: scale(1.01);
    }

    .pdf-page {
      display: block;
      background: white;
    }

    /* Status Bar */
    .status-bar {
      height: var(--status-height);
      background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
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

    .status-item:hover {
      color: var(--text-secondary);
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
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

    .restart-tutorial-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .restart-tutorial-btn {
      width: 100%;
      padding: 12px 16px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15));
      border: 1px solid var(--accent);
      color: var(--accent);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .restart-tutorial-btn:hover {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25));
      transform: translateY(-1px);
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

    /* Onboarding Tutorial */
    .tutorial-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      pointer-events: none;
    }

    .tutorial-overlay.fade-out {
      animation: tutorialFadeOut 0.3s ease forwards;
    }

    @keyframes tutorialFadeOut {
      to {
        opacity: 0;
      }
    }

    .tutorial-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      pointer-events: auto;
    }

    .tutorial-highlight {
      position: fixed;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
      z-index: 10001;
      pointer-events: none;
      transition: all 0.3s ease;
      border: 2px solid var(--accent);
      background: transparent;
    }

    .tutorial-tooltip {
      position: fixed;
      background: linear-gradient(145deg, var(--bg-secondary), var(--bg-tertiary));
      border: 1px solid var(--accent);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      min-width: 320px;
      z-index: 10002;
      pointer-events: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.2);
    }

    .tutorial-tooltip.animate {
      animation: tooltipPop 0.3s ease;
    }

    @keyframes tooltipPop {
      0% {
        opacity: 0;
        transform: scale(0.9) translate(-50%, -50%);
      }
      100% {
        opacity: 1;
        transform: scale(1) translate(-50%, -50%);
      }
    }

    .tutorial-tooltip.position-center {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    .tutorial-tooltip.position-center.animate {
      animation: tooltipPopCenter 0.3s ease;
    }

    @keyframes tooltipPopCenter {
      0% {
        opacity: 0;
        transform: scale(0.9) translate(-50%, -50%);
      }
      100% {
        opacity: 1;
        transform: translate(-50%, -50%);
      }
    }

    /* Tooltip arrows */
    .tutorial-tooltip.position-top::after,
    .tutorial-tooltip.position-bottom::after,
    .tutorial-tooltip.position-left::after,
    .tutorial-tooltip.position-right::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--accent);
      transform: rotate(45deg);
    }

    .tutorial-tooltip.position-bottom::after {
      top: -9px;
      left: 50%;
      margin-left: -8px;
      border-right: none;
      border-bottom: none;
    }

    .tutorial-tooltip.position-top::after {
      bottom: -9px;
      left: 50%;
      margin-left: -8px;
      border-left: none;
      border-top: none;
    }

    .tutorial-tooltip.position-right::after {
      left: -9px;
      top: 50%;
      margin-top: -8px;
      border-right: none;
      border-top: none;
    }

    .tutorial-tooltip.position-left::after {
      right: -9px;
      top: 50%;
      margin-top: -8px;
      border-left: none;
      border-bottom: none;
    }

    .tutorial-progress {
      margin-bottom: 12px;
    }

    .tutorial-step-indicator {
      font-size: 12px;
      color: var(--accent);
      font-weight: 500;
      background: rgba(99, 102, 241, 0.15);
      padding: 4px 10px;
      border-radius: 20px;
    }

    .tutorial-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: var(--text-primary);
      line-height: 1.3;
    }

    .tutorial-content {
      font-size: 14px;
      color: var(--text-secondary);
      margin: 0 0 20px 0;
      line-height: 1.6;
    }

    .tutorial-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .tutorial-nav {
      display: flex;
      gap: 8px;
    }

    .tutorial-btn {
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
    }

    .tutorial-btn.tutorial-skip {
      background: transparent;
      color: var(--text-muted);
      padding: 10px 12px;
    }

    .tutorial-btn.tutorial-skip:hover {
      color: var(--text-secondary);
      background: var(--bg-hover);
    }

    .tutorial-btn.tutorial-prev {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
    }

    .tutorial-btn.tutorial-prev:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .tutorial-btn.tutorial-next {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .tutorial-btn.tutorial-next.primary {
      background: linear-gradient(135deg, var(--accent), #8b5cf6);
      color: white;
      border: none;
    }

    .tutorial-btn.tutorial-next.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
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

    /* Error Line Highlighting */
    .editor-line-error {
      background: rgba(239, 68, 68, 0.15) !important;
      border-left: 3px solid #ef4444 !important;
    }

    .editor-line-warning {
      background: rgba(245, 158, 11, 0.15) !important;
      border-left: 3px solid #f59e0b !important;
    }

    .editor-glyph-error {
      background: #ef4444;
      border-radius: 50%;
      margin-left: 5px;
      width: 8px !important;
      height: 8px !important;
    }

    .editor-glyph-warning {
      background: #f59e0b;
      border-radius: 50%;
      margin-left: 5px;
      width: 8px !important;
      height: 8px !important;
    }

    .editor-line-validation {
      background: rgba(34, 211, 238, 0.15) !important;
      border-left: 3px solid #22d3ee !important;
    }

    .editor-glyph-validation {
      background: #22d3ee;
      border-radius: 50%;
      margin-left: 5px;
      width: 8px !important;
      height: 8px !important;
    }

    /* Error Window - Panel at bottom of editor */
    .error-window {
      position: relative;
      max-height: 200px;
      background: var(--bg-secondary);
      border-top: 2px solid var(--error);
      display: none;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 10;
    }

    .error-window.visible {
      display: flex;
    }

    .error-window.minimized .error-window-body {
      display: none;
    }

    .error-window.minimized {
      max-height: none;
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
      max-height: 150px;
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

    /* Error Code Snippet */
    .error-code-snippet {
      margin-top: 10px;
      margin-left: 26px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      padding: 8px 0;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
      font-size: 12px;
      overflow-x: auto;
      border: 1px solid var(--border-color);
    }

    .snippet-line {
      display: flex;
      line-height: 1.6;
      padding: 0 12px;
    }

    .snippet-line.error-line {
      background: rgba(239, 68, 68, 0.1);
    }

    .snippet-line-num {
      min-width: 32px;
      padding-right: 12px;
      color: var(--text-muted);
      text-align: right;
      user-select: none;
      flex-shrink: 0;
    }

    .snippet-line-content {
      flex: 1;
      white-space: pre;
      color: var(--text-primary);
    }

    .error-highlight {
      background: rgba(239, 68, 68, 0.3);
      color: var(--error);
      border-bottom: 2px wavy var(--error);
      padding: 0 2px;
      border-radius: 2px;
    }

    .snippet-indicator {
      display: flex;
      line-height: 1.2;
      padding: 0 12px;
    }

    .snippet-indicator-arrow {
      flex: 1;
      white-space: pre;
      color: var(--error);
      font-weight: bold;
    }

    /* Light theme adjustments for code snippet */
    [data-theme="light"] .error-code-snippet {
      background: #f8f9fa;
    }

    [data-theme="light"] .snippet-line.error-line {
      background: rgba(220, 38, 38, 0.08);
    }

    [data-theme="light"] .error-highlight {
      background: rgba(220, 38, 38, 0.2);
    }

    /* Make preview-panel position relative for absolute error window */
    /* Adjust editor content when error window is visible */
    .editor-panel:has(.error-window.visible) .editor-content {
      flex: 1;
      min-height: 0;
    }

    .editor-panel:has(.error-window.visible) .visual-editor-container {
      flex: 1;
      min-height: 0;
    }
  `;
  document.head.appendChild(style);
}

// =====================
// START
// =====================
init().catch(console.error);
