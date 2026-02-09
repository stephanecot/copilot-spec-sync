# Quickstart Guide - Copilot Spec Sync

## 🎯 Using the extension (no CLI required)

### Step 1: Open the interface

1. Click the **Spec Sync** icon in the activity bar
2. You will see the main panels:
   - **Actions** (dashboard)
   - **Specifications** (uploaded specs list)
   - **History** (past comparisons)

### Step 2: Upload a specification

**Method 1 - Dashboard:**
- Click **"Upload a Specification"** in the Actions panel and select your .docx or .md file

**Method 2 - Specifications toolbar:**
- Click the **➕** upload icon in the Specifications panel

**Method 3 - Command Palette:**
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type "upload" and select "Copilot Spec Sync: Upload Specification"

### Step 3: Generate documentation (optional)

From the dashboard, click **"Generate Documentation"** and choose Markdown, Word, or both.

### Step 4: Compare with code

From the dashboard, click **"Compare with Code"** to start analysis. You can also use the Compare icon in the Specifications panel.

> ⏱️ Analysis may take a few minutes depending on project size.

### Step 5: Review results

#### Specifications panel:
- Requirements grouped by status:
  - ✅ Implemented
  - ⚠️ Partial
  - ❌ Missing
  - 🔶 Divergent

#### In code:
- Files receive colored decorations; hover to see requirement details

#### Dashboard:
- Click **"Show Compliance"** for a detailed breakdown

### Step 6: Show critical gaps

Use the Command Palette: `Cmd+Shift+P` → "Copilot Spec Sync: Show Gaps" to see only missing or divergent requirements.

### Step 7: Export results

From the dashboard, click **"Export Report"** to generate Word or Markdown reports.

## 🔄 Follow-up workflow

1. Update your code
2. Run **Compare with Code** again
3. Check **History** for evolution
4. Status bar shows current compliance %

## 💡 Tips

- Use the Refresh button (🔄) in any view to reload content
- Click the status bar to open the compliance view
- Chat mode: use `@specsync` in Copilot chat for advanced actions

## ⚙️ Customization

In VS Code settings, search for "Spec Sync" to configure:
- Default output format
- Output folder
- Generation language (FR/EN)
- Enable/disable code annotations
- Enable/disable status bar

## 🆘 Help

If you need assistance:
- See the full README
- Use `@specsync` in the chat
- Open an issue on GitHub
