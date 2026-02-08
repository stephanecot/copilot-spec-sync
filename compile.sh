#!/bin/bash
# Script de compilation et rechargement rapide pour le développement

set -e

cd "$(dirname "$0")"

echo "🔨 Compilation de l'extension..."
npm run build

echo ""
echo "✅ Extension compilée avec succès !"
echo ""
echo "📋 Prochaines étapes :"
echo "  1. Dans VSCode : Cmd+Shift+P"
echo "  2. Tapez : Developer: Reload Window"
echo "  3. Testez vos modifications"
echo ""
echo "💡 Astuce : Utilisez 'npm run watch' pour la compilation automatique"
