# Copilot Spec Sync

Extension VSCode pour générer de la documentation et comparer votre code avec des spécifications Word, alimentée par GitHub Copilot.

## 🚀 Fonctionnalités

### 1. Interface Graphique (Sans ligne de commande)

L'extension offre une interface complète accessible depuis la barre latérale :

#### **Dashboard Actions**
Cliquez sur l'icône Spec Sync dans la barre d'activité pour accéder au dashboard avec tous les boutons :
- **📖 Générer la documentation** - Génère automatiquement la doc de vos projets
- **📤 Uploader une spécification Word** - Importez votre fichier .docx
- **🔍 Comparer avec le code** - Analyse les écarts entre code et spec
- **📈 Afficher la conformité** - Vue détaillée de la conformité
- **💾 Exporter le rapport** - Exporte en Word ou Markdown

#### **Vue Spécifications**
Affiche toutes les specs uploadées avec :
- Boutons dans la toolbar : ➕ Upload, 🔍 Compare, 🔄 Refresh
- Arborescence des exigences par statut
- Icônes colorées par état (✅ Implémenté, ⚠️ Partiel, ❌ Manquant)

#### **Vue Historique**
Historique de toutes les comparaisons avec date et pourcentage de conformité

#### **Barre de statut**
Indicateur de conformité en bas à droite (ex: "Spec Sync: 75%")

### 2. Commandes Palette (Cmd+Shift+P)

Toutes les commandes sont disponibles dans la palette :
- `Copilot Spec Sync: Upload Specification`
- `Copilot Spec Sync: Generate Documentation`
- `Copilot Spec Sync: Compare Code vs Spec`
- `Copilot Spec Sync: Show Compliance Report`
- `Copilot Spec Sync: Show Gaps`
- `Copilot Spec Sync: Export Documentation as Markdown`
- `Copilot Spec Sync: Export Documentation as Word`
- `Copilot Spec Sync: Export Compliance Report`

### 3. Chat Participant (Mode Avancé)

Pour les utilisateurs avancés, vous pouvez aussi utiliser le chat :

Tapez `@specsync` dans le chat Copilot, puis :
- `/doc` - Générer la documentation
- `/upload` - Uploader une spec
- `/compare` - Comparer code vs spec
- `/gaps` - Lister les écarts
- `/status` - Résumé de conformité
- `/history` - Voir l'historique
- `/implement REQ-XXX` - Proposer l'implémentation d'une exigence

## 📋 Workflow Typique

1. **Cliquez sur l'icône Spec Sync** dans la barre latérale
2. **Cliquez sur "Uploader une spécification Word"** dans le dashboard
3. Sélectionnez votre fichier .docx
4. **Cliquez sur "Comparer avec le code"**
5. Consultez les résultats dans la vue Spécifications
6. **Cliquez sur "Afficher la conformité"** pour voir les détails
7. Utilisez **"Exporter le rapport"** pour sauvegarder les résultats

## 🎨 Annotations dans le Code

Les fichiers de code sont automatiquement annotés avec :
- 🟢 Bordure verte - Exigence implémentée
- 🟠 Bordure orange - Exigence partiellement implémentée
- 🔴 Bordure rouge - Exigence non implémentée ou divergente

Survolez les annotations pour voir les détails de l'exigence.

## ⚙️ Configuration

Ouvrez les paramètres VSCode et recherchez "Spec Sync" :

- **Format de sortie** : Markdown, DOCX, ou les deux
- **Dossier de sortie** : Emplacement des docs générées (défaut: `./docs`)
- **Langue** : Français ou Anglais
- **Seuil de confiance** : Niveau de certitude minimum (0-100)
- **Afficher la barre de statut** : Activer/désactiver l'indicateur
- **Afficher les annotations** : Activer/désactiver les décorations de code

## 🔧 Développement

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run watch

# Package extension
npx vsce package
```

## 📝 Format des Spécifications

L'extension détecte automatiquement les exigences dans vos fichiers Word en cherchant :

**Mots-clés français** : doit, devra, devrait, doit être, est requis, est nécessaire, il faut
**Mots-clés anglais** : must, shall, should, required, mandatory, need to

**Priorités MoSCoW** :
- Must have / Obligatoire
- Should have / Souhaitable
- Could have / Optionnel
- Won't have / Exclu

## 🐛 Problèmes Connus

- Le chat participant nécessite GitHub Copilot actif
- Les LM Tools nécessitent VSCode 1.93+

## 📄 Licence

MIT
