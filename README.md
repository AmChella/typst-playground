# Typst Playground

<p align="center">
  <img src="public/images/favicon_io/android-chrome-512x512.png" alt="Typst Playground Logo" width="128" height="128">
</p>

<p align="center">
  <strong>A modern, browser-based Typst editor with live preview</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#templates">Templates</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a>
</p>

---

## ✨ Features

### Editor
- **Monaco Editor** - VS Code's editor with Typst syntax highlighting
- **Live Preview** - Real-time PDF rendering as you type
- **Intelligent Autocomplete** - Context-aware suggestions for:
  - Typst functions (`#set`, `#let`, `#show`, etc.)
  - Font names (including custom uploaded fonts)
  - Paper sizes, colors, alignments
- **Dark/Light/System Theme** - Automatic theme detection based on OS preference
- **Find & Replace** - Full-featured search with regex support

### Document Management
- **Multiple Templates** - 9 professional templates ready to use
- **File Uploads** - Drag-and-drop images and assets
- **Custom Fonts** - Upload and use TTF, OTF, WOFF, WOFF2 fonts
- **Auto-save** - Documents persist in IndexedDB
- **Export to PDF** - Download compiled documents

### Preview
- **Zoom Controls** - Zoom in/out with mouse wheel or buttons
- **Fit to Width** - Auto-fit document to panel width
- **Page Navigation** - Multi-page document support
- **Error Display** - Inline error messages with line numbers

### Sharing
- **Share via URL** - Generate shareable links with embedded code
- **Copy Link** - Quick clipboard access

### Offline Support
- **Service Worker** - Works offline after first load
- **PWA Ready** - Installable as a Progressive Web App

---

## 🖥️ Demo

![Typst Playground Screenshot](docs/screenshot.png)

*The editor features a clean, modern interface inspired by Overleaf and typst.app*

---

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/typst-playground.git
cd typst-playground

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
# Build optimized bundle
npm run build

# Preview production build
npm run preview
```

---

## 🚀 Usage

### Writing Documents

1. **Start typing** in the editor panel (left side)
2. **Preview updates** automatically in the preview panel (right side)
3. **Export PDF** using the download button in the toolbar

### Using Images

1. **Upload images** via the sidebar (Files → Upload button)
2. **Drag and drop** files directly onto the Uploads section
3. **Reference in code**:
   ```typst
   #image("your-image.png", width: 80%)
   ```

### Using Custom Fonts

1. **Upload fonts** via the Fonts section in the sidebar
2. **Use in document**:
   ```typst
   #set text(font: "Your Font Name")
   ```

### Autocomplete

Press `Ctrl+Space` or start typing to trigger suggestions:
- After `#` - shows keywords and functions
- After `#set ` - shows settable elements
- In `font: "` - shows available fonts
- In `fill:` / `stroke:` - shows colors

---

## 📄 Templates

| Template | Description |
|----------|-------------|
| 📄 **Blank** | Empty document to start fresh |
| 📰 **Article** | Academic article with abstract and sections |
| ✉️ **Letter** | Formal business letter |
| 📋 **Resume/CV** | Professional resume template |
| 📊 **Report** | Business or academic report |
| 🎯 **Slides** | Presentation slides (16:9) |
| 🔢 **Math Notes** | Mathematics with equations |
| 🔬 **Elsevier Journal** | Academic journal article (Elsevier style) |
| 🎓 **Thesis** | Academic thesis with chapters |

Access templates via the **Templates** button in the toolbar.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save document |
| `Ctrl/Cmd + F` | Find |
| `Ctrl/Cmd + H` | Find & Replace |
| `Ctrl/Cmd + /` | Toggle comment |
| `Ctrl/Cmd + +` | Zoom in |
| `Ctrl/Cmd + -` | Zoom out |
| `Ctrl/Cmd + 0` | Reset zoom |
| `F11` | Toggle fullscreen |

---

## 🏗️ Project Structure

```
typst-playground/
├── public/
│   ├── assets/          # Sample images
│   ├── fonts/           # Default fonts
│   ├── images/          # App icons
│   ├── manifest.json    # PWA manifest
│   └── sw.js            # Service worker
├── src/
│   ├── main.js          # Main application logic
│   ├── compiler-worker.js # Typst compilation worker
│   ├── typst-language.js  # Monaco language config
│   ├── templates.js     # Document templates
│   ├── storage.js       # IndexedDB persistence
│   ├── share.js         # URL sharing utilities
│   ├── icons.js         # SVG icons
│   └── style.css        # Additional styles
├── docs/                # Sample documents
├── index.html           # Entry point
├── vite.config.js       # Vite configuration
└── package.json
```

---

## 🔧 Configuration

### Vite Config

```javascript
// vite.config.js
export default defineConfig({
  optimizeDeps: {
    exclude: ["@myriaddreamin/typst-ts-web-compiler"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
});
```

### Settings

Access via the ⚙️ Settings button:

- **Theme**: Dark / Light / System
- **Font Size**: Editor font size
- **Tab Size**: 2 or 4 spaces
- **Line Numbers**: Show/hide
- **Word Wrap**: Enable/disable
- **Minimap**: Show/hide code minimap
- **Auto-compile**: Compile on keystroke
- **Compile Delay**: Debounce time (ms)

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| [Typst.ts](https://github.com/Myriad-Dreamin/typst.ts) | Typst compilation in WebAssembly |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | Code editor component |
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF rendering |
| [Vite](https://vitejs.dev/) | Build tool and dev server |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | Client-side storage |

---

## 📝 Typst Resources

- [Typst Documentation](https://typst.app/docs/)
- [Typst Package Universe](https://typst.app/universe)
- [Typst GitHub](https://github.com/typst/typst)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Typst](https://typst.app/) - The modern typesetting system
- [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) - TypeScript bindings for Typst
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - The code editor that powers VS Code
- [Overleaf](https://www.overleaf.com/) - Inspiration for the UI/UX design

---

<p align="center">
  Made with ❤️ for the Typst community
</p>

