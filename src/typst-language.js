// Typst language definition for Monaco Editor
// Monarch tokenizer for syntax highlighting

export const typstLanguageConfig = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"],
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "$", close: "$" },
    { open: "*", close: "*" },
    { open: "_", close: "_" },
    { open: "`", close: "`" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "$", close: "$" },
    { open: "*", close: "*" },
    { open: "_", close: "_" },
  ],
};

export const typstTokensProvider = {
  defaultToken: "",
  tokenPostfix: ".typst",

  keywords: [
    "let",
    "set",
    "show",
    "if",
    "else",
    "for",
    "while",
    "break",
    "continue",
    "return",
    "import",
    "include",
    "as",
    "in",
    "not",
    "and",
    "or",
    "none",
    "auto",
    "true",
    "false",
  ],

  builtinFunctions: [
    "text",
    "par",
    "page",
    "heading",
    "list",
    "enum",
    "table",
    "figure",
    "image",
    "box",
    "block",
    "grid",
    "stack",
    "align",
    "pad",
    "move",
    "scale",
    "rotate",
    "hide",
    "repeat",
    "link",
    "ref",
    "cite",
    "footnote",
    "quote",
    "raw",
    "emph",
    "strong",
    "strike",
    "underline",
    "overline",
    "highlight",
    "smallcaps",
    "sub",
    "super",
    "math",
    "equation",
    "numbering",
    "counter",
    "state",
    "locate",
    "query",
    "selector",
    "document",
    "bibliography",
    "lorem",
    "rgb",
    "luma",
    "cmyk",
    "oklab",
    "oklch",
    "color",
    "gradient",
    "pattern",
    "stroke",
    "line",
    "rect",
    "square",
    "ellipse",
    "circle",
    "polygon",
    "path",
    "place",
    "float",
    "columns",
    "colbreak",
    "pagebreak",
    "v",
    "h",
    "datetime",
    "duration",
    "type",
    "repr",
    "panic",
    "assert",
    "eval",
    "sym",
    "emoji",
  ],

  typeKeywords: ["int", "float", "str", "bool", "array", "dict", "content", "function"],

  operators: [
    "=",
    ">",
    "<",
    "!",
    "~",
    "?",
    ":",
    "==",
    "<=",
    ">=",
    "!=",
    "&&",
    "||",
    "++",
    "--",
    "+",
    "-",
    "*",
    "/",
    "&",
    "|",
    "^",
    "%",
    "<<",
    ">>",
    "+=",
    "-=",
    "*=",
    "/=",
    "=>",
    "..",
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Headings (= at start of line)
      [/^(=+)(\s.*)$/, ["keyword.heading", "markup.heading"]],

      // Comments
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],

      // Raw/code blocks with triple backticks
      [/```\w*/, "string.raw", "@rawblock"],

      // Inline raw/code with single backtick
      [/`[^`]*`/, "string.raw"],

      // Math mode (inline and display)
      [/\$\$/, "string.math", "@mathblock"],
      [/\$/, "string.math", "@mathinline"],

      // Labels
      [/<[a-zA-Z_][a-zA-Z0-9_-]*>/, "tag"],

      // References
      [/@[a-zA-Z_][a-zA-Z0-9_-]*/, "tag.reference"],

      // Function calls starting with #
      [
        /#([a-zA-Z_][a-zA-Z0-9_]*)/,
        {
          cases: {
            "@keywords": "keyword",
            "@builtinFunctions": "support.function",
            "@default": "entity.name.function",
          },
        },
      ],

      // Strong emphasis **text** or *text* at word boundaries
      [/\*\*[^*]+\*\*/, "markup.bold"],
      [/\*[^*]+\*/, "markup.bold"],

      // Emphasis _text_
      [/_[^_]+_/, "markup.italic"],

      // Strikethrough
      [/~~[^~]+~~/, "markup.strikethrough"],

      // URLs and links
      [/https?:\/\/[^\s\)]+/, "string.link"],

      // Strings
      [/"([^"\\]|\\.)*$/, "string.invalid"], // non-terminated string
      [/"/, "string", "@string"],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
      [/\d+([eE][\-+]?\d+)?/, "number"],
      [/\d+%/, "number.percentage"],
      [/\d+(pt|mm|cm|in|em|fr|deg|rad)/, "number.unit"],

      // Identifiers and keywords
      [
        /[a-zA-Z_][a-zA-Z0-9_]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@builtinFunctions": "support.function",
            "@default": "identifier",
          },
        },
      ],

      // Delimiters and operators
      [/[{}()\[\]]/, "@brackets"],
      [/[<>](?!@symbols)/, "@brackets"],
      [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],

      // Delimiter
      [/[;,.]/, "delimiter"],

      // Whitespace
      [/\s+/, "white"],
    ],

    comment: [
      [/[^\/*]+/, "comment"],
      [/\/\*/, "comment", "@push"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"],
    ],

    string: [
      [/[^\\"]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/"/, "string", "@pop"],
    ],

    rawblock: [
      [/[^`]+/, "string.raw"],
      [/```/, "string.raw", "@pop"],
      [/`/, "string.raw"],
    ],

    mathinline: [
      [/[^\$\\]+/, "string.math"],
      [/\\./, "string.math.escape"],
      [/\$/, "string.math", "@pop"],
    ],

    mathblock: [
      [/[^\$\\]+/, "string.math"],
      [/\\./, "string.math.escape"],
      [/\$\$/, "string.math", "@pop"],
      [/\$/, "string.math"],
    ],
  },
};

// Custom dark theme for Typst
export const typstTheme = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "C586C0" },
    { token: "keyword.heading", foreground: "569CD6", fontStyle: "bold" },
    { token: "markup.heading", foreground: "4EC9B0", fontStyle: "bold" },
    { token: "markup.bold", foreground: "CE9178", fontStyle: "bold" },
    { token: "markup.italic", foreground: "CE9178", fontStyle: "italic" },
    { token: "markup.strikethrough", foreground: "808080", fontStyle: "strikethrough" },
    { token: "comment", foreground: "6A9955" },
    { token: "string", foreground: "CE9178" },
    { token: "string.raw", foreground: "D7BA7D" },
    { token: "string.math", foreground: "B5CEA8" },
    { token: "string.link", foreground: "4EC9B0", fontStyle: "underline" },
    { token: "number", foreground: "B5CEA8" },
    { token: "number.float", foreground: "B5CEA8" },
    { token: "number.unit", foreground: "B5CEA8" },
    { token: "number.percentage", foreground: "B5CEA8" },
    { token: "operator", foreground: "D4D4D4" },
    { token: "tag", foreground: "4EC9B0" },
    { token: "tag.reference", foreground: "9CDCFE" },
    { token: "support.function", foreground: "DCDCAA" },
    { token: "entity.name.function", foreground: "DCDCAA" },
    { token: "type", foreground: "4EC9B0" },
  ],
  colors: {
    "editor.background": "#1e1e1e",
  },
};

// Custom light theme for Typst
export const typstLightTheme = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "AF00DB" },
    { token: "keyword.heading", foreground: "0000FF", fontStyle: "bold" },
    { token: "markup.heading", foreground: "267f99", fontStyle: "bold" },
    { token: "markup.bold", foreground: "a31515", fontStyle: "bold" },
    { token: "markup.italic", foreground: "a31515", fontStyle: "italic" },
    { token: "markup.strikethrough", foreground: "808080", fontStyle: "strikethrough" },
    { token: "comment", foreground: "008000" },
    { token: "string", foreground: "a31515" },
    { token: "string.raw", foreground: "795E26" },
    { token: "string.math", foreground: "098658" },
    { token: "string.link", foreground: "267f99", fontStyle: "underline" },
    { token: "number", foreground: "098658" },
    { token: "number.float", foreground: "098658" },
    { token: "number.unit", foreground: "098658" },
    { token: "number.percentage", foreground: "098658" },
    { token: "operator", foreground: "000000" },
    { token: "tag", foreground: "267f99" },
    { token: "tag.reference", foreground: "001080" },
    { token: "support.function", foreground: "795E26" },
    { token: "entity.name.function", foreground: "795E26" },
    { token: "type", foreground: "267f99" },
  ],
  colors: {
    "editor.background": "#ffffff",
  },
};

// Typst completion items
const typstCompletions = {
  // Keywords and directives
  keywords: [
    { label: "#set", insertText: "#set ${1:element}(${2:options})", detail: "Set element properties", documentation: "Configure default properties for elements" },
    { label: "#let", insertText: "#let ${1:name} = ${2:value}", detail: "Define a variable or function", documentation: "Create a new variable or function binding" },
    { label: "#show", insertText: "#show ${1:selector}: ${2:replacement}", detail: "Transform elements", documentation: "Apply transformations to matching elements" },
    { label: "#import", insertText: '#import "${1:path}": ${2:items}', detail: "Import from module", documentation: "Import items from another file or package" },
    { label: "#include", insertText: '#include "${1:path}"', detail: "Include file content", documentation: "Include the content of another Typst file" },
    { label: "#if", insertText: "#if ${1:condition} {\n  ${2:content}\n}", detail: "Conditional", documentation: "Conditionally include content" },
    { label: "#else", insertText: "#else {\n  ${1:content}\n}", detail: "Else branch", documentation: "Alternative branch for conditionals" },
    { label: "#for", insertText: "#for ${1:item} in ${2:collection} {\n  ${3:content}\n}", detail: "For loop", documentation: "Iterate over a collection" },
    { label: "#while", insertText: "#while ${1:condition} {\n  ${2:content}\n}", detail: "While loop", documentation: "Loop while condition is true" },
    { label: "#return", insertText: "#return ${1:value}", detail: "Return value", documentation: "Return a value from a function" },
    { label: "#break", insertText: "#break", detail: "Break loop", documentation: "Exit the current loop" },
    { label: "#continue", insertText: "#continue", detail: "Continue loop", documentation: "Skip to next iteration" },
  ],
  
  // Common functions
  functions: [
    // Text functions
    { label: "text", insertText: "text(${1:options})[${2:content}]", detail: "Text element", documentation: "Style text content" },
    { label: "emph", insertText: "emph[${1:content}]", detail: "Emphasize text", documentation: "Emphasize (italicize) text" },
    { label: "strong", insertText: "strong[${1:content}]", detail: "Strong text", documentation: "Make text bold" },
    { label: "underline", insertText: "underline[${1:content}]", detail: "Underline text", documentation: "Underline text" },
    { label: "strike", insertText: "strike[${1:content}]", detail: "Strikethrough", documentation: "Strike through text" },
    { label: "smallcaps", insertText: "smallcaps[${1:content}]", detail: "Small caps", documentation: "Display text in small capitals" },
    { label: "sub", insertText: "sub[${1:content}]", detail: "Subscript", documentation: "Subscript text" },
    { label: "super", insertText: "super[${1:content}]", detail: "Superscript", documentation: "Superscript text" },
    { label: "highlight", insertText: "highlight[${1:content}]", detail: "Highlight text", documentation: "Highlight text with a background color" },
    { label: "overline", insertText: "overline[${1:content}]", detail: "Overline text", documentation: "Add a line above text" },
    { label: "raw", insertText: 'raw("${1:code}", lang: "${2:language}")', detail: "Raw/code text", documentation: "Display raw text or code" },
    { label: "link", insertText: 'link("${1:url}")[${2:text}]', detail: "Hyperlink", documentation: "Create a hyperlink" },
    
    // Layout functions
    { label: "align", insertText: "align(${1:alignment})[${2:content}]", detail: "Align content", documentation: "Align content horizontally/vertically" },
    { label: "block", insertText: "block(${1:options})[${2:content}]", detail: "Block element", documentation: "Create a block-level element" },
    { label: "box", insertText: "box(${1:options})[${2:content}]", detail: "Inline box", documentation: "Create an inline box element" },
    { label: "stack", insertText: "stack(dir: ${1:ttb}, spacing: ${2:1em})[${3:content}]", detail: "Stack elements", documentation: "Stack elements vertically or horizontally" },
    { label: "grid", insertText: "grid(\n  columns: (${1:1fr, 1fr}),\n  gutter: ${2:1em},\n  ${3:content}\n)", detail: "Grid layout", documentation: "Create a grid layout" },
    { label: "columns", insertText: "columns(${1:2})[${2:content}]", detail: "Multi-column layout", documentation: "Split content into multiple columns" },
    { label: "h", insertText: "h(${1:1em})", detail: "Horizontal space", documentation: "Add horizontal spacing" },
    { label: "v", insertText: "v(${1:1em})", detail: "Vertical space", documentation: "Add vertical spacing" },
    { label: "pagebreak", insertText: "pagebreak()", detail: "Page break", documentation: "Insert a page break" },
    { label: "colbreak", insertText: "colbreak()", detail: "Column break", documentation: "Insert a column break" },
    { label: "place", insertText: "place(${1:top + right})[${2:content}]", detail: "Place content", documentation: "Place content at a specific position" },
    { label: "pad", insertText: "pad(${1:1em})[${2:content}]", detail: "Add padding", documentation: "Add padding around content" },
    { label: "move", insertText: "move(dx: ${1:0pt}, dy: ${2:0pt})[${3:content}]", detail: "Move content", documentation: "Move content by an offset" },
    { label: "rotate", insertText: "rotate(${1:45deg})[${2:content}]", detail: "Rotate content", documentation: "Rotate content by an angle" },
    { label: "scale", insertText: "scale(${1:100%})[${2:content}]", detail: "Scale content", documentation: "Scale content by a factor" },
    
    // Document structure
    { label: "heading", insertText: "heading(level: ${1:1})[${2:Title}]", detail: "Heading", documentation: "Create a heading" },
    { label: "figure", insertText: "figure(\n  ${1:content},\n  caption: [${2:Caption}],\n)", detail: "Figure with caption", documentation: "Create a figure with a caption" },
    { label: "table", insertText: "table(\n  columns: ${1:3},\n  ${2:[Header 1], [Header 2], [Header 3],}\n  ${3:[Cell 1], [Cell 2], [Cell 3],}\n)", detail: "Table", documentation: "Create a table" },
    { label: "image", insertText: 'image("${1:path}", width: ${2:100%})', detail: "Image", documentation: "Include an image" },
    { label: "rect", insertText: "rect(width: ${1:100%}, height: ${2:50pt}, fill: ${3:gray})[${4:content}]", detail: "Rectangle", documentation: "Draw a rectangle" },
    { label: "circle", insertText: "circle(radius: ${1:10pt}, fill: ${2:blue})", detail: "Circle", documentation: "Draw a circle" },
    { label: "ellipse", insertText: "ellipse(width: ${1:20pt}, height: ${2:10pt})", detail: "Ellipse", documentation: "Draw an ellipse" },
    { label: "line", insertText: "line(length: ${1:100%}, stroke: ${2:1pt})", detail: "Line", documentation: "Draw a line" },
    { label: "polygon", insertText: "polygon(${1:vertices})", detail: "Polygon", documentation: "Draw a polygon" },
    { label: "path", insertText: "path(${1:commands})", detail: "Path", documentation: "Draw a custom path" },
    
    // Lists
    { label: "list", insertText: "list(\n  [${1:Item 1}],\n  [${2:Item 2}],\n)", detail: "Bullet list", documentation: "Create a bullet list" },
    { label: "enum", insertText: "enum(\n  [${1:Item 1}],\n  [${2:Item 2}],\n)", detail: "Numbered list", documentation: "Create a numbered list" },
    { label: "terms", insertText: "terms(\n  [${1:Term}]: [${2:Definition}],\n)", detail: "Definition list", documentation: "Create a definition/terms list" },
    
    // Math
    { label: "equation", insertText: "equation(${1:numbering: \"(1)\"})[$ ${2:math} $]", detail: "Equation", documentation: "Create a numbered equation" },
    
    // Utilities
    { label: "lorem", insertText: "lorem(${1:50})", detail: "Lorem ipsum", documentation: "Generate placeholder text" },
    { label: "numbering", insertText: 'numbering("${1:1.}", ${2:1})', detail: "Format number", documentation: "Format a number with a pattern" },
    { label: "counter", insertText: "counter(${1:heading})", detail: "Counter", documentation: "Access a counter" },
    { label: "state", insertText: 'state("${1:key}", ${2:initial})', detail: "State", documentation: "Create mutable state" },
    { label: "query", insertText: "query(${1:selector})", detail: "Query elements", documentation: "Query document elements" },
    { label: "locate", insertText: "locate(loc => ${1:content})", detail: "Get location", documentation: "Get current location in document" },
    { label: "metadata", insertText: "metadata(${1:value})", detail: "Metadata", documentation: "Attach metadata to content" },
    { label: "datetime", insertText: "datetime.today()", detail: "Date/time", documentation: "Get current date/time" },
    { label: "rgb", insertText: 'rgb("${1:#000000}")', detail: "RGB color", documentation: "Create an RGB color" },
    { label: "luma", insertText: "luma(${1:50})", detail: "Grayscale", documentation: "Create a grayscale color" },
    { label: "eval", insertText: 'eval("${1:code}")', detail: "Evaluate code", documentation: "Evaluate Typst code string" },
    { label: "repr", insertText: "repr(${1:value})", detail: "Representation", documentation: "Get string representation" },
    { label: "type", insertText: "type(${1:value})", detail: "Get type", documentation: "Get the type of a value" },
    { label: "assert", insertText: "assert(${1:condition}, message: ${2:message})", detail: "Assert", documentation: "Assert a condition is true" },
    { label: "panic", insertText: 'panic("${1:message}")', detail: "Panic", documentation: "Abort with an error message" },
  ],
  
  // Set targets
  setTargets: [
    { label: "document", insertText: "document(\n  title: \"${1:Title}\",\n  author: \"${2:Author}\",\n)", detail: "Document metadata" },
    { label: "page", insertText: "page(\n  paper: \"${1:a4}\",\n  margin: ${2:2cm},\n)", detail: "Page settings" },
    { label: "text", insertText: "text(\n  font: \"${1:New Computer Modern}\",\n  size: ${2:11pt},\n)", detail: "Text settings" },
    { label: "par", insertText: "par(\n  justify: ${1:true},\n  leading: ${2:0.65em},\n)", detail: "Paragraph settings" },
    { label: "heading", insertText: 'heading(numbering: "${1:1.}")', detail: "Heading settings" },
    { label: "figure", insertText: "figure(supplement: [${1:Figure}])", detail: "Figure settings" },
    { label: "table", insertText: "table(stroke: ${1:0.5pt})", detail: "Table settings" },
    { label: "list", insertText: "list(marker: [${1:•}])", detail: "List settings" },
    { label: "enum", insertText: 'enum(numbering: "${1:1.}")', detail: "Enum settings" },
    { label: "math.equation", insertText: 'math.equation(numbering: "${1:(1)}")', detail: "Equation numbering" },
  ],
  
  // Paper sizes
  paperSizes: [
    "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11",
    "iso-b1", "iso-b2", "iso-b3", "iso-b4", "iso-b5", "iso-b6", "iso-b7", "iso-b8",
    "us-letter", "us-legal", "us-tabloid", "us-executive",
    "presentation-16-9", "presentation-4-3",
  ],
  
  // Built-in fonts
  fonts: [
    "New Computer Modern", "New Computer Modern Math",
    "DejaVu Sans Mono", "Libertinus Serif",
    "Linux Libertine", "Linux Biolinum",
    "Fira Sans", "Fira Code", "Fira Math",
    "IBM Plex Sans", "IBM Plex Serif", "IBM Plex Mono",
    "Source Sans Pro", "Source Serif Pro", "Source Code Pro",
    "Roboto", "Roboto Mono", "Roboto Slab",
    "Open Sans", "Lato", "Montserrat", "Raleway",
    "PT Sans", "PT Serif", "PT Mono",
    "Ubuntu", "Ubuntu Mono",
    "Noto Sans", "Noto Serif", "Noto Sans Mono",
    "Inter", "Poppins", "Work Sans",
  ],
  
  // Alignments
  alignments: ["left", "center", "right", "top", "bottom", "horizon", "start", "end"],
  
  // Colors
  colors: [
    "black", "white", "gray", "silver", "red", "maroon", "yellow", "olive",
    "lime", "green", "aqua", "teal", "blue", "navy", "fuchsia", "purple",
    "orange", "eastern", "forest", "conifer",
  ],
  
  // Units
  units: ["pt", "mm", "cm", "in", "em", "fr", "%", "deg", "rad"],
};

// Custom fonts list (will be updated dynamically)
let customFontsList = [];

// Export function to update custom fonts
export function updateCustomFonts(fonts) {
  customFontsList = fonts.map(f => f.replace(/\.[^/.]+$/, '')); // Remove extension
}

// Register Typst language with Monaco
export function registerTypstLanguage(monaco) {
  // Register the language
  monaco.languages.register({ id: "typst", extensions: [".typ"], aliases: ["Typst", "typst"] });

  // Set language configuration
  monaco.languages.setLanguageConfiguration("typst", typstLanguageConfig);

  // Set tokens provider (Monarch)
  monaco.languages.setMonarchTokensProvider("typst", typstTokensProvider);

  // Define themes
  monaco.editor.defineTheme("typst-dark", typstTheme);
  monaco.editor.defineTheme("typst-light", typstLightTheme);
  
  // Register completion provider
  monaco.languages.registerCompletionItemProvider("typst", {
    triggerCharacters: ["#", ".", '"', "(", ":", " "],
    
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      
      const suggestions = [];
      
      // After # - show keywords and functions
      if (textUntilPosition.match(/#\w*$/)) {
        // Keywords
        typstCompletions.keywords.forEach(item => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: item.detail,
            documentation: item.documentation,
            range,
          });
        });
        
        // Functions
        typstCompletions.functions.forEach(item => {
          suggestions.push({
            label: "#" + item.label,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: item.detail,
            documentation: item.documentation,
            range,
          });
        });
      }
      
      // After #set - show set targets
      else if (textUntilPosition.match(/#set\s+\w*$/)) {
        typstCompletions.setTargets.forEach(item => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: item.detail,
            range,
          });
        });
      }
      
      // Font context - after font: " or font: '
      else if (textUntilPosition.match(/font:\s*["'][^"']*$/)) {
        // Built-in fonts
        typstCompletions.fonts.forEach(font => {
          suggestions.push({
            label: font,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: font,
            detail: "Built-in font",
            range,
          });
        });
        
        // Custom fonts
        customFontsList.forEach(font => {
          suggestions.push({
            label: font,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: font,
            detail: "Custom font (uploaded)",
            range,
            sortText: "0" + font, // Sort custom fonts first
          });
        });
      }
      
      // Paper size context
      else if (textUntilPosition.match(/paper:\s*["'][^"']*$/)) {
        typstCompletions.paperSizes.forEach(size => {
          suggestions.push({
            label: size,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: size,
            detail: "Paper size",
            range,
          });
        });
      }
      
      // Color context
      else if (textUntilPosition.match(/(fill|stroke|color):\s*\w*$/)) {
        typstCompletions.colors.forEach(color => {
          suggestions.push({
            label: color,
            kind: monaco.languages.CompletionItemKind.Color,
            insertText: color,
            detail: "Color",
            range,
          });
        });
        
        // Also suggest rgb and luma functions
        suggestions.push({
          label: "rgb",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'rgb("${1:#000000}")',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "RGB color function",
          range,
        });
        suggestions.push({
          label: "luma",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "luma(${1:128})",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Grayscale color function",
          range,
        });
      }
      
      // Alignment context
      else if (textUntilPosition.match(/(align|alignment):\s*\w*$/)) {
        typstCompletions.alignments.forEach(align => {
          suggestions.push({
            label: align,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: align,
            detail: "Alignment",
            range,
          });
        });
      }
      
      // General context - show common functions
      else if (word.word.length > 0) {
        typstCompletions.functions.forEach(item => {
          if (item.label.toLowerCase().startsWith(word.word.toLowerCase())) {
            suggestions.push({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: item.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: item.detail,
              documentation: item.documentation,
              range,
            });
          }
        });
      }
      
      return { suggestions };
    },
  });
}
