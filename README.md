# Copilot Spec Sync

VS Code extension to generate documentation and compare your code against Word or Markdown specifications, powered by GitHub Copilot.

## 🚀 Features

### 1. Graphical Interface (no CLI required)

The extension provides a full sidebar dashboard:

#### Dashboard Actions
Open the Spec Sync icon in the activity bar to access the dashboard with the following actions:
- **📖 Generate Documentation** - Automatically generate project documentation
- **📤 Upload a Specification** - Import a .docx or .md file
- **🔍 Compare with Code** - Detect gaps between code and the specification
- **📈 Show Compliance** - Detailed compliance overview
- **💾 Export Report** - Export results as Word or Markdown

#### Specifications View
Shows uploaded specs with:
- Toolbar buttons: ➕ Upload, 🔍 Compare, 🔄 Refresh
- Requirements tree grouped by status
- Colored icons for status (✅ Implemented, ⚠️ Partial, ❌ Missing)

#### History View
Shows past comparisons with date and compliance percentage

#### Status Bar
Compliance indicator in the bottom-right (e.g. "Spec Sync: 75%")

### 2. Command Palette (Cmd/Ctrl+Shift+P)

All extension commands are available in the Command Palette:
- `Copilot Spec Sync: Upload Specification`
- `Copilot Spec Sync: Generate Documentation`
- `Copilot Spec Sync: Compare Code vs Spec`
- `Copilot Spec Sync: Show Compliance Report`
- `Copilot Spec Sync: Show Gaps`
- `Copilot Spec Sync: Export Documentation as Markdown`
- `Copilot Spec Sync: Export Documentation as Word`
- `Copilot Spec Sync: Export Compliance Report`

### 3. Chat Participant (Advanced)

Advanced users can also use the chat integration:

Type `@specsync` in the Copilot chat, then:
- `/doc` - Generate documentation
- `/upload` - Upload a spec
- `/compare` - Compare code vs spec
- `/gaps` - List gaps
- `/status` - Compliance summary
- `/history` - Show history
- `/implement REQ-XXX` - Propose implementation for a requirement

## 📋 Typical Workflow

1. Click the Spec Sync icon in the sidebar
2. Upload a specification (Word or Markdown)
3. Click "Compare with Code"
4. Review results in the Specifications view
5. Click "Show Compliance" for a detailed breakdown
6. Export the report if needed

## 🎨 Code Annotations

Source files are automatically decorated with:
- 🟢 Green border — Requirement implemented
- 🟠 Orange border — Requirement partially implemented
- 🔴 Red border — Requirement missing or divergent

Hover decorations to see requirement details.

## ⚙️ Configuration

Open VS Code settings and search for "Spec Sync":

- **Output format**: Markdown, DOCX, or both
- **Output folder**: Location for generated docs (default: `./docs`)
- **Language**: French or English
- **Confidence threshold**: Minimum confidence % (0-100)
- **Show status bar**: Enable/disable status indicator
- **Show annotations**: Enable/disable code decorations

## 🔧 Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run watch

# Package extension
npx vsce package
```

## 📝 Specification Format

The extension detects requirements in documents using keyword patterns:

**French keywords**: doit, devra, devrait, doit être, est requis, est nécessaire, il faut
**English keywords**: must, shall, should, required, mandatory, need to

**MoSCoW priorities**:
- Must have
- Should have
- Could have
- Won't have

## 🐛 Known Issues

- Chat participant requires GitHub Copilot to be enabled
- LM Tools require a recent VS Code with Copilot support

## 📄 License

MIT
