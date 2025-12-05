// Typst Web Compiler Worker
// Uses @myriaddreamin/typst.ts high-level API

console.log("[Compiler Worker] Script loading...");

let typstModule = null;
let isModuleLoaded = false;
let virtualFiles = new Map();
let isCompiling = false;
let pendingSource = null;

// Load the typst module (once)
async function loadModule() {
  if (isModuleLoaded) return;
  
  try {
    console.log("[Compiler Worker] Loading module...");
    typstModule = await import("@myriaddreamin/typst.ts");
    isModuleLoaded = true;
    console.log("[Compiler Worker] Module loaded");
  } catch (err) {
    console.error("[Compiler Worker] Module load failed:", err);
    throw err;
  }
}

// Create a fresh compiler for each compilation
async function createFreshCompiler() {
  const { createTypstCompiler, loadFonts } = typstModule;
  
  const compiler = createTypstCompiler();
  
  await compiler.init({
    getModule: () =>
      "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
    beforeBuild: [
      loadFonts([], { assets: ["text"] }),
    ],
  });
  
  return compiler;
}

// Load module on startup
loadModule().catch((err) => {
  console.error("[Compiler Worker] Startup error:", err);
});

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, source, files } = event.data;

  // Handle legacy format (just source string)
  const actualSource = typeof event.data === "string" ? event.data : source;
  const actualFiles = files || {};

  // Ensure module is loaded
  if (!isModuleLoaded) {
    try {
      await loadModule();
    } catch (err) {
      self.postMessage({
        type: "compiled",
        ok: false,
        error: "Module load failed: " + err.toString(),
      });
      return;
    }
  }

  // Update virtual filesystem
  updateVirtualFiles(actualFiles);

  // Compile
  await compileDocument(actualSource);
};

// Update virtual filesystem with uploaded files
function updateVirtualFiles(files) {
  for (const [path, data] of Object.entries(files)) {
    virtualFiles.set(path, data);
  }
}

// Compile document
async function compileDocument(source) {
  // If already compiling, save for later
  if (isCompiling) {
    pendingSource = source;
    return;
  }
  
  isCompiling = true;
  
  try {
    console.log("[Compiler Worker] Creating fresh compiler...");
    
    // Create a fresh compiler for each compilation
    const compiler = await createFreshCompiler();
    
    // Add the main source file
    compiler.addSource("/main.typ", source);
    
    // Add any uploaded files to shadow filesystem
    for (const [path, data] of virtualFiles) {
      if (data instanceof Uint8Array) {
        compiler.mapShadow("/" + path, data);
      }
    }
    
    console.log("[Compiler Worker] Compiling...");

    // Compile to PDF
    const result = await compiler.compile({
      mainFilePath: "/main.typ",
      format: 1, // PDF format
    });

    if (result && result.result) {
      self.postMessage({
        type: "compiled",
        ok: true,
        pdfBuffer: result.result,
      });
    } else if (result && result.diagnostics) {
      // Extract error message from diagnostics
      let errorMsg = "Compilation failed";
      if (typeof result.diagnostics === "string") {
        errorMsg = result.diagnostics;
      } else if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
        errorMsg = result.diagnostics.map(d => d.message || JSON.stringify(d)).join("\n");
      }
      self.postMessage({
        type: "compiled",
        ok: false,
        error: errorMsg,
      });
    } else {
      self.postMessage({
        type: "compiled",
        ok: false,
        error: "Unknown compilation error",
      });
    }
  } catch (err) {
    console.error("[Compiler Worker] Compile error:", err);
    
    let errorMessage = err.toString();
    if (err.message) {
      errorMessage = err.message;
    }
    
    self.postMessage({
      type: "compiled",
      ok: false,
      error: errorMessage,
    });
  } finally {
    isCompiling = false;
    
    // Process pending compilation if any
    if (pendingSource !== null) {
      const nextSource = pendingSource;
      pendingSource = null;
      // Use setTimeout to break call stack
      setTimeout(() => compileDocument(nextSource), 0);
    }
  }
}

// Handle errors
self.onerror = (error) => {
  console.error("[Compiler Worker] Error:", error);
  self.postMessage({
    type: "compiled",
    ok: false,
    error: "Worker error: " + (error.message || error),
  });
};
