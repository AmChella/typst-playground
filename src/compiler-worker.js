// Typst Web Compiler Worker
// Uses @myriaddreamin/typst.ts high-level API

console.log("[Compiler Worker] Script loading...");

let typstModule = null;
let isModuleLoaded = false;
let virtualFiles = new Map();
let customFonts = [];
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
  // Log available typst module exports for debugging (only once)
  if (!createFreshCompiler.logged) {
    console.log("[Compiler Worker] typst.ts exports:", Object.keys(typstModule));
    createFreshCompiler.logged = true;
  }

  const compiler = typstModule.createTypstCompiler();

  // loadFonts accepts Uint8Array directly (not Blobs!)
  const fontDataArrays = customFonts.map(font => {
    console.log(`[Compiler Worker] Preparing font: ${font.name} (${font.data.length} bytes)`);
    // Ensure it's a proper Uint8Array
    return font.data instanceof Uint8Array ? font.data : new Uint8Array(font.data);
  });

  // Build initialization options
  const initOptions = {
    getModule: () =>
      "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
    // "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0-rc1/pkg/typst_ts_web_compiler_bg.wasm",
    beforeBuild: [],
  };

  // Use loadFonts with Uint8Array data + default text assets
  const fontLoader = typstModule.loadFonts || typstModule.preloadRemoteFonts;
  if (fontLoader) {
    // Pass font data as Uint8Array directly, along with default text fonts
    initOptions.beforeBuild.push(
      fontLoader(fontDataArrays, { assets: ["text"] })
    );
    console.log(`[Compiler Worker] Loading ${fontDataArrays.length} custom fonts with default text assets`);
  }

  await compiler.init(initOptions);

  // Log compiler methods for debugging (only once)
  if (!createFreshCompiler.compilerLogged) {
    console.log("[Compiler Worker] Compiler methods:", Object.keys(compiler));
    createFreshCompiler.compilerLogged = true;
  }

  return compiler;
}

// Load module on startup
loadModule().catch((err) => {
  console.error("[Compiler Worker] Startup error:", err);
});

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, source, files, fonts } = event.data;

  // Handle font loading message
  if (type === 'loadFonts') {
    customFonts = (fonts || []).map(font => {
      // Ensure data is Uint8Array
      let data = font.data;
      if (!(data instanceof Uint8Array)) {
        if (data instanceof ArrayBuffer) {
          data = new Uint8Array(data);
        } else if (Array.isArray(data)) {
          data = new Uint8Array(data);
        } else if (data && data.buffer) {
          data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        }
      }
      return { name: font.name, data };
    });
    console.log(`[Compiler Worker] Received ${customFonts.length} custom fonts:`);
    customFonts.forEach(f => {
      console.log(`  - ${f.name}: ${f.data?.length || 0} bytes, type: ${f.data?.constructor?.name}`);
    });
    return;
  }

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
      // Create a clean copy of the PDF bytes to ensure proper transfer
      // Note: We don't use transferList here because the buffer needs to remain
      // usable for both preview rendering and later export
      const pdfBytes = new Uint8Array(result.result);
      self.postMessage({
        type: "compiled",
        ok: true,
        pdfBuffer: pdfBytes,
      });
    } else if (result && result.diagnostics) {
      // Extract detailed error information from diagnostics
      const diagnostics = parseDiagnostics(result.diagnostics);
      self.postMessage({
        type: "compiled",
        ok: false,
        error: diagnostics.summary,
        diagnostics: diagnostics.items,
      });
    } else {
      self.postMessage({
        type: "compiled",
        ok: false,
        error: "Unknown compilation error",
        diagnostics: [{
          severity: "error",
          message: "Unknown compilation error",
          file: "/main.typ",
          line: null,
          column: null,
          hint: null,
        }],
      });
    }
  } catch (err) {
    console.error("[Compiler Worker] Compile error:", err);

    let errorMessage = err.toString();
    if (err.message) {
      errorMessage = err.message;
    }

    // Try to parse error for line/column info
    const parsedError = parseErrorMessage(errorMessage);

    self.postMessage({
      type: "compiled",
      ok: false,
      error: errorMessage,
      diagnostics: [parsedError],
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

// Parse diagnostics from compilation result
function parseDiagnostics(diagnostics) {
  const items = [];
  let summary = "Compilation failed";

  if (typeof diagnostics === "string") {
    // Try to parse string diagnostics
    const parsed = parseErrorMessage(diagnostics);
    items.push(parsed);
    summary = diagnostics.split('\n')[0];
  } else if (Array.isArray(diagnostics)) {
    for (const d of diagnostics) {
      if (typeof d === "string") {
        items.push(parseErrorMessage(d));
      } else if (typeof d === "object" && d !== null) {
        // Handle diagnostic object format
        const item = {
          severity: d.severity || "error",
          message: d.message || JSON.stringify(d),
          file: d.span?.file || d.file || "/main.typ",
          line: d.span?.start?.line || d.line || null,
          column: d.span?.start?.column || d.column || null,
          endLine: d.span?.end?.line || null,
          endColumn: d.span?.end?.column || null,
          hint: d.hints?.join("; ") || d.hint || null,
        };
        items.push(item);
      }
    }
    if (items.length > 0) {
      const errorCount = items.filter(i => i.severity === "error").length;
      const warningCount = items.filter(i => i.severity === "warning").length;
      const parts = [];
      if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
      if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
      summary = parts.length > 0 ? `Compilation failed: ${parts.join(', ')}` : "Compilation failed";
    }
  }

  // If no items parsed, add a generic error
  if (items.length === 0) {
    items.push({
      severity: "error",
      message: typeof diagnostics === "string" ? diagnostics : "Unknown error",
      file: "/main.typ",
      line: null,
      column: null,
      hint: null,
    });
  }

  return { items, summary };
}

// Parse error message string to extract line/column info
function parseErrorMessage(errorStr) {
  const result = {
    severity: "error",
    message: errorStr,
    file: "/main.typ",
    line: null,
    column: null,
    hint: null,
  };

  // Try to match patterns like "error: message at line X, column Y"
  // or "file:line:column: message"
  const patterns = [
    // Pattern: "file.typ:10:5: error message"
    /^([^:]+):(\d+):(\d+):\s*(.+)$/m,
    // Pattern: "error at line 10, column 5"
    /at line (\d+),?\s*column (\d+)/i,
    // Pattern: "line 10"
    /line\s+(\d+)/i,
    // Pattern: ":10:5:" in the string
    /:(\d+):(\d+):/,
  ];

  for (const pattern of patterns) {
    const match = errorStr.match(pattern);
    if (match) {
      if (match.length >= 4 && isNaN(parseInt(match[1]))) {
        // file:line:column: message format
        result.file = match[1];
        result.line = parseInt(match[2]);
        result.column = parseInt(match[3]);
        result.message = match[4] || errorStr;
      } else if (match[1] && match[2]) {
        result.line = parseInt(match[1]);
        result.column = parseInt(match[2]);
      } else if (match[1]) {
        result.line = parseInt(match[1]);
      }
      break;
    }
  }

  // Extract hint if present (often after "hint:" or "note:")
  const hintMatch = errorStr.match(/(?:hint|note):\s*(.+)/i);
  if (hintMatch) {
    result.hint = hintMatch[1].trim();
  }

  return result;
}

// Handle errors
self.onerror = (error) => {
  console.error("[Compiler Worker] Error:", error);
  self.postMessage({
    type: "compiled",
    ok: false,
    error: "Worker error: " + (error.message || error),
    diagnostics: [{
      severity: "error",
      message: "Worker error: " + (error.message || error),
      file: "/main.typ",
      line: null,
      column: null,
      hint: null,
    }],
  });
};
