# Typst Playground - User Guide

Welcome to Typst Playground! This guide will walk you through everything you need to know to create beautiful documents.

---

## 📚 Table of Contents

1. [Getting Started](#getting-started)
2. [The Interface](#the-interface)
3. [Writing Your First Document](#writing-your-first-document)
4. [Using Templates](#using-templates)
5. [Working with Images](#working-with-images)
6. [Custom Fonts](#custom-fonts)
7. [Formatting Text](#formatting-text)
8. [Creating Tables](#creating-tables)
9. [Math Equations](#math-equations)
10. [Page Layout](#page-layout)
11. [Exporting & Sharing](#exporting--sharing)
12. [Keyboard Shortcuts](#keyboard-shortcuts)
13. [Tips & Tricks](#tips--tricks)

---

## 🚀 Getting Started

### What is Typst?

Typst is a modern typesetting system designed to be as powerful as LaTeX but much easier to learn. It's perfect for:
- Academic papers and theses
- Reports and documentation
- Resumes and CVs
- Presentations
- Any document that needs professional formatting

### Your First Visit

When you first open Typst Playground, you'll see:
- **Left Panel**: Code editor where you write Typst markup
- **Right Panel**: Live preview of your compiled PDF
- **Sidebar**: File management, uploads, and fonts

The editor automatically compiles your document as you type!

---

## 🖥️ The Interface

```
┌─────────────────────────────────────────────────────────────┐
│  [≡] Typst Playground    [Templates] [Share] [⬇] [⚙] [?]   │
├─────────┬───────────────────────────┬───────────────────────┤
│ Sidebar │      Code Editor          │    PDF Preview        │
│         │                           │                       │
│ Files   │  = Hello World            │  ┌─────────────────┐  │
│ ├ main  │                           │  │                 │  │
│         │  This is my first         │  │  Hello World    │  │
│ Uploads │  document in *Typst*!     │  │                 │  │
│         │                           │  │  This is my     │  │
│ Fonts   │                           │  │  first document │  │
│         │                           │  │  in Typst!      │  │
│         │                           │  │                 │  │
│         │                           │  └─────────────────┘  │
├─────────┴───────────────────────────┴───────────────────────┤
│  Line 1, Col 1              Ready ✓           Zoom: 100%    │
└─────────────────────────────────────────────────────────────┘
```

### Toolbar Buttons

| Button | Function |
|--------|----------|
| ≡ | Toggle sidebar visibility |
| Templates | Open template gallery |
| Share | Generate shareable link |
| ⬇ | Export/Download PDF |
| ⚙ | Settings (theme, font size, etc.) |
| ? | Help & documentation |

### Sidebar Sections

- **Files**: Your document files
- **Uploads**: Uploaded images and assets
- **Fonts**: Custom fonts you've added

---

## ✍️ Writing Your First Document

### Basic Syntax

```typst
= This is a Heading

This is a paragraph. You can write normally!

== This is a Subheading

- Bullet point 1
- Bullet point 2
- Bullet point 3

+ Numbered item 1
+ Numbered item 2
+ Numbered item 3
```

### Text Formatting

```typst
*Bold text*
_Italic text_
*_Bold and italic_*
`inline code`
#strike[strikethrough]
#underline[underlined]
#highlight[highlighted]
```

### Result:

- **Bold text**
- *Italic text*
- ***Bold and italic***
- `inline code`
- ~~strikethrough~~
- <u>underlined</u>
- <mark>highlighted</mark>

---

## 📋 Using Templates

### Accessing Templates

1. Click the **Templates** button in the toolbar
2. Browse available templates:
   - 📄 Blank
   - 📰 Article
   - ✉️ Letter
   - 📋 Resume/CV
   - 📊 Report
   - 🎯 Slides
   - 🔢 Math Notes
   - 🔬 Elsevier Journal
   - 🎓 Thesis

3. Click a template to use it

### Template Structure

Templates typically include:
- Document setup (`#set` rules)
- Page configuration
- Font settings
- Pre-built sections

### Example: Article Template

```typst
#set document(title: "My Article", author: "Your Name")
#set page(paper: "a4", margin: 2cm)
#set text(font: "New Computer Modern", size: 11pt)
#set heading(numbering: "1.1")

= Introduction
Your content here...

= Methods
Your methods...

= Results
Your results...

= Conclusion
Your conclusions...
```

---

## 🖼️ Working with Images

### Uploading Images

**Method 1: Click Upload**
1. In the sidebar, find the **Uploads** section
2. Click the upload button (↑)
3. Select your image file

**Method 2: Drag & Drop**
1. Drag an image file from your computer
2. Drop it onto the **Uploads** section in the sidebar

### Supported Formats
- PNG, JPG, JPEG
- GIF, SVG, WebP

### Using Images in Your Document

```typst
// Basic image
#image("photo.png")

// With width constraint
#image("photo.png", width: 50%)

// With specific dimensions
#image("photo.png", width: 10cm, height: 8cm)

// Centered image with caption
#figure(
  image("photo.png", width: 80%),
  caption: [A descriptive caption]
)
```

### Image Tips

```typst
// Side-by-side images
#grid(
  columns: 2,
  gutter: 1em,
  image("image1.png"),
  image("image2.png"),
)

// Image with border
#box(
  stroke: 1pt,
  image("photo.png", width: 100%)
)
```

---

## 🔤 Custom Fonts

### Uploading Fonts

1. Click the **Fonts** section in the sidebar
2. Click the upload button or drag font files
3. Supported formats: TTF, OTF, WOFF, WOFF2

### Using Custom Fonts

```typst
// Set for entire document
#set text(font: "My Custom Font")

// Use for specific text
#text(font: "My Custom Font")[This text uses the custom font]

// Multiple font fallbacks
#set text(font: ("Primary Font", "Fallback Font", "serif"))
```

### Font Autocomplete

When typing `font: "`, the editor will suggest:
- Built-in fonts (New Computer Modern, etc.)
- Your uploaded custom fonts (shown first!)

---

## 📝 Formatting Text

### Headings

```typst
= Level 1 Heading
== Level 2 Heading
=== Level 3 Heading
==== Level 4 Heading
```

### Paragraphs & Spacing

```typst
First paragraph.

Second paragraph (blank line creates new paragraph).

#v(2em)  // Vertical space

Text after extra space.
```

### Text Styling

```typst
// Size
#text(size: 14pt)[Larger text]
#text(size: 8pt)[Smaller text]

// Color
#text(fill: red)[Red text]
#text(fill: rgb("#3b82f6"))[Blue text]

// Weight
#text(weight: "bold")[Bold]
#text(weight: 300)[Light]

// Combined
#text(size: 16pt, fill: blue, weight: "bold")[Styled text]
```

### Alignment

```typst
#align(left)[Left aligned]
#align(center)[Centered]
#align(right)[Right aligned]

// Center a block
#align(center)[
  This entire block
  is centered
]
```

---

## 📊 Creating Tables

### Basic Table

```typst
#table(
  columns: 3,
  [Header 1], [Header 2], [Header 3],
  [Cell 1], [Cell 2], [Cell 3],
  [Cell 4], [Cell 5], [Cell 6],
)
```

### Styled Table

```typst
#table(
  columns: (1fr, 2fr, 1fr),
  align: (left, center, right),
  stroke: 0.5pt,
  inset: 8pt,
  
  // Header row
  table.header(
    [*Name*], [*Description*], [*Price*],
  ),
  
  // Data rows
  [Apple], [A red fruit], [$1.00],
  [Banana], [A yellow fruit], [$0.50],
  [Orange], [A citrus fruit], [$0.75],
)
```

### Table with Caption

```typst
#figure(
  table(
    columns: 2,
    [A], [B],
    [1], [2],
  ),
  caption: [My table caption]
)
```

---

## ➗ Math Equations

### Inline Math

```typst
The equation $E = m c^2$ is famous.

The quadratic formula is $x = (-b ± sqrt(b^2 - 4a c)) / (2a)$.
```

### Display Math (Block)

```typst
$ E = m c^2 $

$ integral_0^infinity e^(-x^2) dif x = sqrt(pi) / 2 $

$ sum_(n=1)^infinity 1/n^2 = pi^2 / 6 $
```

### Numbered Equations

```typst
#set math.equation(numbering: "(1)")

$ a^2 + b^2 = c^2 $

$ F = m a $
```

### Common Math Symbols

```typst
$ alpha, beta, gamma, delta $     // Greek letters
$ plus.minus, times, div $        // Operators
$ arrow.r, arrow.l, arrow.t.b $   // Arrows
$ infinity, partial, nabla $      // Special symbols
$ <= , >= , != , approx $         // Relations
```

### Matrices

```typst
$ mat(
  1, 2, 3;
  4, 5, 6;
  7, 8, 9;
) $

$ vec(x, y, z) $
```

---

## 📄 Page Layout

### Page Setup

```typst
#set page(
  paper: "a4",           // or "us-letter", "a5", etc.
  margin: 2cm,           // uniform margins
  // Or specific margins:
  // margin: (top: 2cm, bottom: 2cm, left: 2.5cm, right: 2.5cm),
)
```

### Headers & Footers

```typst
#set page(
  header: [
    My Document Title
    #h(1fr)
    #datetime.today().display()
  ],
  footer: [
    #h(1fr)
    #counter(page).display("1 of 1", both: true)
    #h(1fr)
  ],
)
```

### Multi-Column Layout

```typst
#columns(2)[
  This content will be
  split into two columns
  automatically.
  
  #colbreak()  // Force column break
  
  Second column starts here.
]
```

### Page Breaks

```typst
Content on page 1.

#pagebreak()

Content on page 2.
```

---

## 📤 Exporting & Sharing

### Export PDF

1. Click the **Download** button (⬇) in the toolbar
2. Your PDF will be downloaded automatically
3. Filename: `document.pdf`

### Share via Link

1. Click the **Share** button
2. A URL is generated with your code embedded
3. Click **Copy Link** to copy to clipboard
4. Share the link - recipients can view and edit!

### Sharing Tips

- Shared links contain the full document code
- Changes made by others don't affect your original
- Links work offline once the page is loaded

---

## ⌨️ Keyboard Shortcuts

### Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save document |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + F` | Find |
| `Ctrl/Cmd + H` | Find & Replace |
| `Ctrl/Cmd + /` | Toggle comment |
| `Ctrl/Cmd + D` | Duplicate line |
| `Alt + ↑/↓` | Move line up/down |
| `Ctrl + Space` | Trigger autocomplete |

### Preview Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + +` | Zoom in |
| `Ctrl/Cmd + -` | Zoom out |
| `Ctrl/Cmd + 0` | Reset zoom |
| `Mouse Wheel` | Scroll / Zoom (with Ctrl) |

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `F11` | Toggle fullscreen |
| `Escape` | Close modal/dialog |

---

## 💡 Tips & Tricks

### 1. Use Autocomplete

Press `Ctrl+Space` anywhere to see suggestions:
- After `#` - see all functions
- After `#set ` - see settable elements  
- In `font: "` - see available fonts
- In `fill:` - see colors

### 2. Quick Formatting

```typst
// Instead of this:
#text(weight: "bold")[Bold text]

// Use this shorthand:
*Bold text*
```

### 3. Reusable Styles

```typst
// Define once
#let note(body) = box(
  fill: yellow.lighten(80%),
  inset: 8pt,
  radius: 4pt,
  body
)

// Use anywhere
#note[This is a note!]
#note[Another note!]
```

### 4. Import Packages

```typst
// Use community packages
#import "@preview/tablex:0.0.8": tablex

#tablex(
  columns: 3,
  [A], [B], [C],
)
```

### 5. Comments

```typst
// This is a single-line comment

/* This is a
   multi-line
   comment */
```

### 6. Raw Text / Code Blocks

````typst
// Inline code
`let x = 5`

// Code block
```python
def hello():
    print("Hello, World!")
```
````

### 7. Links

```typst
// URL link
#link("https://typst.app")[Typst Website]

// Email link  
#link("mailto:email@example.com")[Contact Us]
```

### 8. Footnotes

```typst
This has a footnote#footnote[This is the footnote text.].

More content here.
```

### 9. Bibliography

```typst
// At the end of your document
#bibliography("refs.bib")

// In your text
As shown by @citation_key...
```

### 10. Debug Layout

```typst
// Show element boundaries
#set page(fill: luma(95%))
#box(fill: white, inset: 1em)[Your content]
```

---

## ❓ Common Issues

### "Unknown font" Error

**Solution**: Upload the font file first, then use the exact font name.

### Image Not Showing

**Solution**: 
1. Make sure image is uploaded (check Uploads section)
2. Use exact filename: `#image("filename.png")`

### Compilation Stuck

**Solution**: 
1. Check for syntax errors (missing brackets, etc.)
2. Try refreshing the page
3. Check browser console for errors

### PDF Export Blank

**Solution**: Wait for compilation to complete (status shows "Ready ✓")

---

## 📖 Learn More

- [Official Typst Documentation](https://typst.app/docs/)
- [Typst Package Universe](https://typst.app/universe)
- [Typst Discord Community](https://discord.gg/typst)
- [Typst GitHub](https://github.com/typst/typst)

---

<p align="center">
  <strong>Happy writing! 📝</strong>
</p>

