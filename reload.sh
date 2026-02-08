#!/bin/bash

echo "🔧 Recompilation de l'extension..."
cd /Users/stephanecottin/dev/ia/test/.github/skills/copilot-spec-sync
npm run build

echo "✅ Extension recompilée"
echo ""
echo "📋 Prochaines étapes :"
echo "1. Dans VSCode, appuyez sur Cmd+Shift+P"
echo "2. Tapez 'Developer: Reload Window' et validez"
echo "3. Cliquez sur l'icône Spec Sync dans la barre latérale"
echo "4. Testez le bouton 'Générer la documentation'"
echo ""
echo "🐛 Pour déboguer :"
echo "1. Ouvrez la Developer Console : Cmd+Shift+P → 'Developer: Toggle Developer Tools'"
echo "2. Allez dans l'onglet 'Console' pour voir les erreurs éventuelles"
echo ""
echo "📊 Fichiers compilés :"
ls -lh dist/extension.js
echo ""
echo "🔗 Symlink actif :"
ls -l ~/.vscode/extensions/ | grep copilot-spec-sync
