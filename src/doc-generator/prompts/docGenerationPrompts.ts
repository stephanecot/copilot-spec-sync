import * as vscode from 'vscode';
import { ProjectAnalysis } from '../../types.js';
import { truncateToTokenBudget } from '../../utils/tokenBudget.js';

export function buildStructureAnalysisMessages(analysis: ProjectAnalysis): vscode.LanguageModelChatMessage[] {
  const fileTreeStr = analysis.fileTree.slice(0, 100).join('\n');
  const keyFilesStr = analysis.keyFiles.map(f => `- ${f.path} (${f.role})`).join('\n');
  const modulesStr = analysis.moduleStructure.map(m => `- ${m.name}/ (${m.type}, ${m.files.length} fichiers)`).join('\n');
  const depsStr = Object.entries(analysis.projectInfo.dependencies).slice(0, 20).map(([k, v]) => `  ${k}: ${v}`).join('\n');

  const prompt = `Tu es un architecte logiciel expert. Analyse la structure suivante et produis un plan de documentation.

## Projet : ${analysis.projectInfo.name}
**Type** : ${analysis.projectInfo.type}
**Langage** : ${analysis.projectInfo.language}
**Frameworks** : ${analysis.frameworks.join(', ') || 'N/A'}
**Patterns** : ${analysis.patterns.join(', ') || 'N/A'}

## Points d'entrée
${analysis.projectInfo.entryPoints.join(', ') || 'N/A'}

## Fichiers clés
${keyFilesStr || 'Aucun'}

## Modules
${modulesStr || 'Aucun'}

## Dépendances
${depsStr || 'Aucune'}

## Arborescence (extrait)
${truncateToTokenBudget(fileTreeStr, 2000)}

Produis un résumé structurel concis de ce projet en 3-5 phrases.`;

  return [vscode.LanguageModelChatMessage.User(prompt)];
}

export function buildSectionGenerationMessages(
  section: string,
  projectAnalysis: ProjectAnalysis,
  relevantFiles: { path: string; content: string; language: string }[],
  lang: string,
): vscode.LanguageModelChatMessage[] {
  const langInstruction = lang === 'fr'
    ? 'Rédige la documentation en français.'
    : 'Write the documentation in English.';

  const sectionInstructions: Record<string, string> = {
    overview: `Génère une vue d'ensemble du projet : description, stack technique, dépendances principales, objectif du projet. ${langInstruction}`,
    architecture: `Décris l'architecture du projet : structure des dossiers, patterns utilisés (MVC, microservices, etc.), flux de données. Si possible inclus un diagramme Mermaid. ${langInstruction}`,
    api: `Documente les API et endpoints du projet : routes HTTP, méthodes, paramètres, corps de requête/réponse. Format en tableau Markdown. ${langInstruction}`,
    models: `Documente les modèles de données : entités, schémas, DTOs, relations entre modèles. Format en tableau. ${langInstruction}`,
    services: `Documente les services et la logique métier : description de chaque service, méthodes publiques, flux métier principaux. ${langInstruction}`,
    config: `Documente la configuration : variables d'environnement, fichiers de config, profils. ${langInstruction}`,
    tests: `Documente la stratégie de test : types de tests, couverture, frameworks utilisés, comment lancer les tests. ${langInstruction}`,
    deployment: `Documente le déploiement : scripts, Dockerfiles, CI/CD, instructions de déploiement. ${langInstruction}`,
  };

  const instruction = sectionInstructions[section] || `Documente la section "${section}". ${langInstruction}`;

  let filesContext = '';
  let totalTokens = 0;
  const maxTokens = 15000;

  for (const file of relevantFiles) {
    const fileBlock = `### ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    const tokens = Math.ceil(fileBlock.length / 4);

    if (totalTokens + tokens > maxTokens) {
      const remaining = maxTokens - totalTokens;
      if (remaining > 500) {
        filesContext += `### ${file.path}\n\`\`\`${file.language}\n${truncateToTokenBudget(file.content, remaining - 100)}\n\`\`\`\n\n`;
      }
      break;
    }

    filesContext += fileBlock;
    totalTokens += tokens;
  }

  const prompt = `Tu es un rédacteur technique expert. ${instruction}

## Contexte du projet
- **Nom** : ${projectAnalysis.projectInfo.name}
- **Type** : ${projectAnalysis.projectInfo.type}
- **Langage** : ${projectAnalysis.projectInfo.language}
- **Frameworks** : ${projectAnalysis.frameworks.join(', ') || 'N/A'}

## Fichiers source pertinents

${filesContext || '*Aucun fichier pertinent trouvé pour cette section.*'}

Génère la documentation pour cette section. Sois concis, précis et technique. Utilise des tableaux Markdown quand c'est approprié.
Ne répète pas le titre de la section, commence directement par le contenu.`;

  return [vscode.LanguageModelChatMessage.User(prompt)];
}
