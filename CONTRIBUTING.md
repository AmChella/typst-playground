# Contributing to Typst Playground

Thank you for your interest in contributing to Typst Playground! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- A modern browser (Chrome, Firefox, Safari, Edge)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/typst-playground.git
   cd typst-playground
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser** to `http://localhost:5173`

## 📁 Project Structure

```
src/
├── main.js              # Main application, UI, and state management
├── compiler-worker.js   # Web Worker for Typst compilation
├── typst-language.js    # Monaco editor language configuration
├── templates.js         # Document templates
├── storage.js           # IndexedDB persistence layer
├── share.js             # URL sharing utilities
├── icons.js             # SVG icon definitions
└── style.css            # Additional CSS styles
```

### Key Components

| File | Responsibility |
|------|----------------|
| `main.js` | UI rendering, event handling, editor setup, PDF preview |
| `compiler-worker.js` | Runs Typst compilation in a Web Worker to avoid blocking UI |
| `typst-language.js` | Syntax highlighting, autocomplete, and language config |
| `storage.js` | Document and file persistence using IndexedDB |

## 🔧 Development Guidelines

### Code Style

- Use ES6+ features (async/await, destructuring, template literals)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and single-purpose

### Adding New Features

1. **Templates**: Add to `src/templates.js`
2. **Icons**: Add SVG to `src/icons.js`
3. **Settings**: Update settings object in `main.js`
4. **Autocomplete**: Modify `typstCompletions` in `typst-language.js`

### Testing Changes

1. Test in multiple browsers (Chrome, Firefox, Safari)
2. Test with different document types
3. Verify offline functionality works
4. Check mobile responsiveness

## 📝 Submitting Changes

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with clear, descriptive commits
   ```bash
   git commit -m "Add: Description of what you added"
   git commit -m "Fix: Description of what you fixed"
   git commit -m "Update: Description of what you updated"
   ```

3. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Open a Pull Request** with:
   - Clear description of changes
   - Screenshots for UI changes
   - Reference to related issues

### Commit Message Format

```
<type>: <description>

[optional body]

[optional footer]
```

Types:
- `Add` - New feature
- `Fix` - Bug fix
- `Update` - Update existing functionality
- `Remove` - Remove feature or code
- `Refactor` - Code refactoring
- `Docs` - Documentation changes
- `Style` - Code style changes (formatting)

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description** - Clear description of the bug
2. **Steps to Reproduce** - How to trigger the bug
3. **Expected Behavior** - What should happen
4. **Actual Behavior** - What actually happens
5. **Screenshots** - If applicable
6. **Browser/OS** - Your environment details

## 💡 Feature Requests

For feature requests, please:

1. Check existing issues first
2. Describe the feature clearly
3. Explain the use case
4. Provide mockups if applicable

## 🏗️ Architecture Notes

### Compilation Flow

```
User types → Monaco Editor → Debounce (300ms) → Web Worker → typst.ts → PDF bytes → PDF.js → Canvas
```

### State Management

- Document content: Monaco Editor model
- Files/Fonts: IndexedDB + in-memory Map
- Settings: localStorage
- UI State: DOM + JavaScript variables

### Theme System

The app uses CSS custom properties for theming:

```css
:root {
  --bg-primary: #1e1e1e;
  --text-primary: #ffffff;
  --accent: #3b82f6;
  /* ... */
}
```

## 📚 Resources

- [Typst Documentation](https://typst.app/docs/)
- [typst.ts API](https://myriad-dreamin.github.io/typst.ts/)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/docs.html)
- [PDF.js API](https://mozilla.github.io/pdf.js/api/)

## 🤝 Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Collaborate openly

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎉

