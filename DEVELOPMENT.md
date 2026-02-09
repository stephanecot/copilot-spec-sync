# Commandes de Développement - Copilot Spec Sync

## 🔨 Compilation

### Compiler l'extension
```bash
npm run build
# ou
npm run compile
# ou
npm run rebuild  # Avec message de rappel pour recharger VSCode
```

### Compilation automatique (watch mode)
```bash
npm run watch
```
Les fichiers seront recompilés automatiquement à chaque modification.

## 📦 Packaging

### Créer le fichier VSIX
```bash
npm run package
```
Génère `copilot-spec-sync-0.1.0.vsix` dans le dossier racine.

### Installation manuelle
```bash
code --install-extension copilot-spec-sync-0.1.0.vsix
```

## 🧪 Tests

### Exécuter tous les tests
```bash
npm test
```

### Mode watch pour les tests
```bash
npm run test:watch
```

### Vérification TypeScript
```bash
npx tsc --noEmit
```

## 🔄 Workflow de Développement

### Méthode 1 : Compilation manuelle
1. Faites vos modifications dans `src/`
2. Compilez : `npm run rebuild`
3. Dans VSCode : `Cmd+Shift+P` → "Developer: Reload Window"
4. Testez vos changements

### Méthode 2 : Watch mode (recommandé)
1. Lancez : `npm run watch` dans un terminal
2. Faites vos modifications
3. Les fichiers sont recompilés automatiquement
4. Dans VSCode : `Cmd+Shift+P` → "Developer: Reload Window"
5. Testez vos changements

## 🐛 Débogage

### Voir les logs de l'extension
1. Dans VSCode : `Cmd+Shift+P`
2. Tapez : "Developer: Toggle Developer Tools"
3. Allez dans l'onglet "Console"
4. Recherchez les logs `[Spec Sync]`

### Recharger l'extension
```
Cmd+Shift+P → "Developer: Reload Window"
```

### Désinstaller l'extension de développement
```bash
rm ~/.vscode/extensions/copilot-spec-sync-dev
```

## 📁 Structure des Fichiers

```
copilot-spec-sync/
├── src/              # Code source TypeScript
├── dist/             # Code compilé (généré)
├── test/             # Tests unitaires
├── media/            # Icônes et ressources
├── package.json      # Configuration de l'extension
├── tsconfig.json     # Configuration TypeScript
└── esbuild.config.mjs # Configuration du bundler
```

## 🔗 Liens Utiles

- **Extension installée** : `~/.vscode/extensions/copilot-spec-sync-dev`
- **Code source** : `/Users/stephanecottin/dev/ia/test/.github/skills/copilot-spec-sync/`
- **Logs VSCode** : Developer Tools → Console

## 🚀 Scripts Rapides

```bash
# Compilation simple
./compile.sh

# Development Guide

## Project setup

1. Ensure you have Node.js v18+ and npm installed
2. Install dependencies:
```
npm install
```

## Useful scripts

- `npm run compile`: build the extension with esbuild
- `npm run watch`: build in watch mode
- `npm test`: run unit tests (vitest)

## Project structure

Key folders and files:

- `src/extension.ts`: extension entry point
- `src/views`: webview UI and views
- `src/spec-comparator`: spec parsing and analysis logic
- `src/doc-generator`: document and diagram generators

## Tests

Run unit tests with:
```
npm test
```

## Debugging in VS Code

1. Open the Run and Debug view
2. Select the "Launch Extension" configuration
3. Press F5 to open an Extension Development Host window

## Contributing

Fork the repository, create a branch, make changes, and open a Pull Request.

## Style guide

Follow TypeScript conventions and the project's coding style.

## 🧪 Unit tests

- Tests are located under `test/unit`
- Use `vitest` to run tests

## 📦 Packaging

Use `vsce` to package the extension when needed.
