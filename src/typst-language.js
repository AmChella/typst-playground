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
}
