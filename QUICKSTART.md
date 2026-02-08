# Guide de Démarrage Rapide - Copilot Spec Sync

## 🎯 Utilisation sans ligne de commande

### Étape 1 : Ouvrir l'interface

1. Cliquez sur l'icône **Spec Sync** (📄) dans la barre d'activité gauche
2. Vous verrez 3 panneaux :
   - **Actions** (Dashboard avec boutons)
   - **Specifications** (Liste des specs)
   - **History** (Historique des comparaisons)

### Étape 2 : Uploader une spécification

**Méthode 1 - Via le Dashboard :**
- Cliquez sur **"📤 Uploader une spécification Word"** dans le panneau Actions
- Sélectionnez votre fichier .docx

**Méthode 2 - Via la toolbar :**
- Dans le panneau "Specifications", cliquez sur l'icône **➕** dans la toolbar en haut

**Méthode 3 - Via la palette de commandes :**
- Appuyez sur `Cmd+Shift+P` (Mac) ou `Ctrl+Shift+P` (Windows/Linux)
- Tapez "upload" et sélectionnez "Copilot Spec Sync: Upload Specification"

### Étape 3 : Générer la documentation (optionnel)

**Via le Dashboard :**
- Cliquez sur **"📖 Générer la documentation"**
- Choisissez le format (Markdown, Word, ou les deux)

### Étape 4 : Comparer avec le code

**Via le Dashboard :**
- Cliquez sur **"🔍 Comparer avec le code"**
- L'analyse démarre automatiquement

**Via la toolbar :**
- Dans le panneau "Specifications", cliquez sur l'icône **🔍**

> ⏱️ La comparaison peut prendre quelques minutes selon la taille du projet

### Étape 5 : Consulter les résultats

#### Dans le panneau Specifications :
- Les exigences sont regroupées par statut :
  - ✅ **Implémentées** - Code conforme
  - ⚠️ **Partielles** - Partiellement implémenté
  - ❌ **Manquantes** - Non implémenté
  - 🔶 **Divergentes** - Code différent de la spec

#### Dans le code :
- Les fichiers sont automatiquement annotés avec des bordures colorées
- Survolez une annotation pour voir les détails

#### Via le Dashboard :
- Cliquez sur **"📈 Afficher la conformité"** pour une vue détaillée

### Étape 6 : Voir les écarts critiques

**Via la palette de commandes :**
- `Cmd+Shift+P` → "Copilot Spec Sync: Show Gaps"
- Affiche uniquement les exigences non implémentées ou divergentes

### Étape 7 : Exporter les résultats

**Via le Dashboard :**
- Cliquez sur **"💾 Exporter le rapport"**
- Le rapport est généré en Word ou Markdown selon vos préférences

## 🔄 Workflow de suivi

1. Modifiez votre code
2. Cliquez sur **"🔍 Comparer avec le code"** à nouveau
3. Consultez le panneau **History** pour voir l'évolution
4. La barre de statut en bas affiche le % de conformité actuel

## 💡 Astuces

- **Bouton Refresh (🔄)** dans chaque vue pour rafraîchir l'affichage
- **Cliquez sur la barre de statut** en bas pour ouvrir la vue de conformité
- **Mode Chat** : Tapez `@specsync` dans le chat Copilot pour des actions avancées
- **Historique** : Comparez 2 versions en utilisant `@specsync /history compare`

## ⚙️ Personnalisation

**Paramètres VSCode → Recherchez "Spec Sync" :**
- Format de sortie par défaut
- Dossier de destination
- Langue de génération (FR/EN)
- Activer/désactiver les annotations de code
- Activer/désactiver la barre de statut

## 🆘 Aide

Si vous avez des questions :
- Consultez le README.md complet
- Utilisez `@specsync` dans le chat pour poser des questions
- Ouvrez un ticket sur GitHub
