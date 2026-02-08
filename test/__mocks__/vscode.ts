// Mock for the vscode module used in tests

export const workspace = {
  workspaceFolders: [],
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue,
  }),
};

export const window = {
  activeTextEditor: undefined,
  createTextEditorDecorationType: () => ({ dispose: () => {} }),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: '',
    tooltip: '',
    command: '',
  }),
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  registerTreeDataProvider: () => ({ dispose: () => {} }),
  showOpenDialog: async () => undefined,
  showInformationMessage: async () => undefined,
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => {},
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
  parse: (str: string) => ({ fsPath: str, scheme: 'file', path: str }),
};

export const ThemeIcon = class {
  constructor(public id: string, public color?: unknown) {}
};

export const ThemeColor = class {
  constructor(public id: string) {}
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export const TreeItem = class {
  label: string;
  collapsibleState: number;
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  constructor(label: string) {
    this.label = label;
    this.collapsibleState = 0;
  }
};

export const StatusBarAlignment = { Left: 1, Right: 2 };
export const OverviewRulerLane = { Left: 1, Center: 2, Right: 4, Full: 7 };

export const EventEmitter = class {
  event = () => {};
  fire() {}
  dispose() {}
};

export const MarkdownString = class {
  value: string;
  constructor(value?: string) { this.value = value || ''; }
};

export const lm = {
  registerTool: () => ({ dispose: () => {} }),
};

export const chat = {
  createChatParticipant: () => ({
    iconPath: undefined,
    followupProvider: undefined,
    dispose: () => {},
  }),
};

export const LanguageModelChatMessage = {
  User: (content: string) => ({ role: 'user', content }),
  Assistant: (content: string) => ({ role: 'assistant', content }),
};

export const CancellationTokenSource = class {
  token = { isCancellationRequested: false, onCancellationRequested: () => {} };
  cancel() {}
  dispose() {}
};
