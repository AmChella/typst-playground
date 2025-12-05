// IndexedDB Storage Module for Typst Web Editor
// Handles document persistence, file storage, and user preferences

const DB_NAME = "typst-editor-db";
const DB_VERSION = 1;

const STORES = {
  DOCUMENTS: "documents",
  FILES: "files",
  PREFERENCES: "preferences",
};

let db = null;

// Initialize IndexedDB
export async function initStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Documents store - for saving Typst source code
      if (!database.objectStoreNames.contains(STORES.DOCUMENTS)) {
        const docStore = database.createObjectStore(STORES.DOCUMENTS, { keyPath: "id" });
        docStore.createIndex("updatedAt", "updatedAt", { unique: false });
        docStore.createIndex("name", "name", { unique: false });
      }

      // Files store - for uploaded images and fonts
      if (!database.objectStoreNames.contains(STORES.FILES)) {
        const fileStore = database.createObjectStore(STORES.FILES, { keyPath: "path" });
        fileStore.createIndex("type", "type", { unique: false });
        fileStore.createIndex("documentId", "documentId", { unique: false });
      }

      // Preferences store - for user settings
      if (!database.objectStoreNames.contains(STORES.PREFERENCES)) {
        database.createObjectStore(STORES.PREFERENCES, { keyPath: "key" });
      }
    };
  });
}

// Generic helpers
function getStore(storeName, mode = "readonly") {
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// =====================
// Document Operations
// =====================

export async function saveDocument(id, content, name = "Untitled") {
  // Get existing doc first (in separate transaction)
  const existingDoc = await getDocument(id);
  const createdAt = existingDoc?.createdAt || Date.now();
  
  // Now create new transaction for the write
  const store = getStore(STORES.DOCUMENTS, "readwrite");
  const doc = {
    id,
    name,
    content,
    createdAt,
    updatedAt: Date.now(),
  };
  return promisifyRequest(store.put(doc));
}

export async function getDocument(id) {
  const store = getStore(STORES.DOCUMENTS);
  return promisifyRequest(store.get(id));
}

export async function getAllDocuments() {
  const store = getStore(STORES.DOCUMENTS);
  return promisifyRequest(store.getAll());
}

export async function deleteDocument(id) {
  // Delete associated files first (in separate transactions)
  await deleteFilesByDocument(id);
  // Then delete the document in a new transaction
  const store = getStore(STORES.DOCUMENTS, "readwrite");
  return promisifyRequest(store.delete(id));
}

// Get the most recent document (for auto-load)
export async function getMostRecentDocument() {
  const docs = await getAllDocuments();
  if (docs.length === 0) return null;
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

// =====================
// File Operations
// =====================

export async function saveFile(path, data, type, documentId = "default") {
  const store = getStore(STORES.FILES, "readwrite");
  const file = {
    path,
    data, // ArrayBuffer or base64 string
    type, // 'image' | 'font' | 'other'
    mimeType: getMimeType(path),
    documentId,
    createdAt: Date.now(),
  };
  return promisifyRequest(store.put(file));
}

export async function getFile(path) {
  const store = getStore(STORES.FILES);
  return promisifyRequest(store.get(path));
}

export async function getAllFiles(documentId = null) {
  const store = getStore(STORES.FILES);
  const files = await promisifyRequest(store.getAll());
  if (documentId) {
    return files.filter((f) => f.documentId === documentId || f.documentId === "default");
  }
  return files;
}

export async function deleteFile(path) {
  const store = getStore(STORES.FILES, "readwrite");
  return promisifyRequest(store.delete(path));
}

async function deleteFilesByDocument(documentId) {
  const files = await getAllFiles(documentId);
  for (const file of files) {
    if (file.documentId === documentId) {
      const store = getStore(STORES.FILES, "readwrite");
      await promisifyRequest(store.delete(file.path));
    }
  }
}

// Get all files as a map for the compiler
export async function getFilesMap(documentId = null) {
  const files = await getAllFiles(documentId);
  const map = {};
  for (const file of files) {
    map[file.path] = file.data;
  }
  return map;
}

// =====================
// Preferences Operations
// =====================

export async function setPreference(key, value) {
  const store = getStore(STORES.PREFERENCES, "readwrite");
  return promisifyRequest(store.put({ key, value }));
}

export async function getPreference(key, defaultValue = null) {
  const store = getStore(STORES.PREFERENCES);
  const result = await promisifyRequest(store.get(key));
  return result?.value ?? defaultValue;
}

export async function getAllPreferences() {
  const store = getStore(STORES.PREFERENCES);
  const prefs = await promisifyRequest(store.getAll());
  return prefs.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});
}

// =====================
// Utility Functions
// =====================

function getMimeType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const mimeTypes = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    // Fonts
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    // Other
    pdf: "application/pdf",
    json: "application/json",
    typ: "text/plain",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// Convert File to ArrayBuffer
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Convert ArrayBuffer to base64
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to ArrayBuffer
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Check if storage is available
export function isStorageAvailable() {
  return db !== null;
}

// Clear all data (for debugging/reset)
export async function clearAllData() {
  const stores = Object.values(STORES);
  for (const storeName of stores) {
    const store = getStore(storeName, "readwrite");
    await promisifyRequest(store.clear());
  }
}

// Export for debugging
export { db, STORES };
