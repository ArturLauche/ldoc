import { Dispatch, SetStateAction, useMemo, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Play,
  Search,
  Settings,
  Terminal,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type IdeFile = {
  id: string;
  name: string;
  path: string;
  language: string;
  content: string;
  icon: "ts" | "json" | "md";
};

type FileNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  fileId?: string;
  children?: FileNode[];
};

const files: IdeFile[] = [
  {
    id: "app",
    name: "App.tsx",
    path: "src/App.tsx",
    language: "typescriptreact",
    icon: "ts",
    content: `import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { CodeEditorPage } from './pages/CodeEditorPage';

export const App = () => {
  return (
    <BrowserRouter>
      <WorkspaceLayout>
        <Routes>
          <Route path="/" element={<CodeEditorPage />} />
        </Routes>
      </WorkspaceLayout>
    </BrowserRouter>
  );
};
`,
  },
  {
    id: "editor",
    name: "CodeEditor.tsx",
    path: "src/components/CodeEditor.tsx",
    language: "typescriptreact",
    icon: "ts",
    content: `import { EditorView } from '@codemirror/view';
import { useMemo } from 'react';

export function CodeEditor() {
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          fontSize: '14px',
          backgroundColor: '#1f2430',
        },
      }),
    ],
    [],
  );

  return <div>Editor shell with reusable extension pipeline.</div>;
}
`,
  },
  {
    id: "theme",
    name: "theme.json",
    path: "config/theme.json",
    language: "json",
    icon: "json",
    content: `{
  "name": "LDoc Midnight",
  "type": "dark",
  "tokens": {
    "keyword": "#80cbc4",
    "string": "#c3e88d",
    "number": "#f78c6c",
    "comment": "#676e95"
  },
  "ui": {
    "sidebar": "#202534",
    "panel": "#1a1f2d",
    "statusBar": "#111522"
  }
}
`,
  },
  {
    id: "notes",
    name: "README.md",
    path: "README.md",
    language: "markdown",
    icon: "md",
    content: `# LDoc IDE Notes

- Press **Cmd/Ctrl + K** to open command palette.
- Press **Cmd/Ctrl + B** to toggle the explorer.
- Use **Cmd/Ctrl + \`** to focus terminal.

This web IDE mock keeps everything local and is designed for instant startup.
`,
  },
];

const tree: FileNode[] = [
  {
    id: "src",
    name: "src",
    type: "folder",
    children: [
      { id: "src-app", name: "App.tsx", type: "file", fileId: "app" },
      {
        id: "src-components",
        name: "components",
        type: "folder",
        children: [
          { id: "src-editor", name: "CodeEditor.tsx", type: "file", fileId: "editor" },
        ],
      },
    ],
  },
  {
    id: "config",
    name: "config",
    type: "folder",
    children: [{ id: "config-theme", name: "theme.json", type: "file", fileId: "theme" }],
  },
  { id: "readme", name: "README.md", type: "file", fileId: "notes" },
];

const iconMap = {
  ts: <FileCode2 className="h-4 w-4 text-sky-400" />,
  json: <FileJson className="h-4 w-4 text-yellow-400" />,
  md: <FileText className="h-4 w-4 text-indigo-300" />,
};

const getLineNumbers = (content: string) =>
  Array.from({ length: Math.max(content.split("\n").length, 1) }, (_, i) => i + 1);

const renderTree = (
  nodes: FileNode[],
  depth: number,
  activeId: string,
  onOpen: (id: string) => void,
  openFolders: Set<string>,
  setOpenFolders: Dispatch<SetStateAction<Set<string>>>,
) => {
  return nodes.map((node) => {
    if (node.type === "folder") {
      const isOpen = openFolders.has(node.id);
      return (
        <div key={node.id}>
          <button
            type="button"
            onClick={() => {
              setOpenFolders((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              });
            }}
            className="group flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {isOpen ? <FolderOpen className="h-4 w-4 text-zinc-400" /> : <Folder className="h-4 w-4 text-zinc-500" />}
            <span className="tracking-wide uppercase text-[11px] text-zinc-400">{node.name}</span>
          </button>
          {isOpen && node.children
            ? renderTree(node.children, depth + 1, activeId, onOpen, openFolders, setOpenFolders)
            : null}
        </div>
      );
    }

    const file = files.find((entry) => entry.id === node.fileId);
    if (!file) return null;

    return (
      <button
        key={node.id}
        type="button"
        onClick={() => onOpen(file.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
          activeId === file.id ? "bg-sky-500/20 text-sky-200" : "text-zinc-300 hover:bg-zinc-800",
        )}
        style={{ paddingLeft: `${depth * 14 + 16}px` }}
      >
        {iconMap[file.icon]}
        <span>{file.name}</span>
      </button>
    );
  });
};

const CodeEditor = () => {
  const [openTabs, setOpenTabs] = useState<string[]>(["app", "editor", "theme"]);
  const [activeFileId, setActiveFileId] = useState("editor");
  const [terminalMode, setTerminalMode] = useState<"problems" | "output" | "terminal">("terminal");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["src", "src-components", "config"]));

  const activeFile = useMemo(
    () => files.find((file) => file.id === activeFileId) ?? files[0],
    [activeFileId],
  );

  const openFile = (id: string) => {
    setActiveFileId(id);
    setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]));
  };

  const closeTab = (id: string) => {
    setOpenTabs((tabs) => tabs.filter((tabId) => tabId !== id));
    if (id === activeFileId) {
      const fallback = openTabs.find((tabId) => tabId !== id) ?? files[0].id;
      setActiveFileId(fallback);
    }
  };

  const lineNumbers = getLineNumbers(activeFile.content);

  return (
    <div className="min-h-screen bg-[#0f1116] text-zinc-100">
      <div className="flex h-screen flex-col">
        <header className="flex h-11 items-center justify-between border-b border-zinc-800 bg-[#181c25] px-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <WandSparkles className="h-4 w-4 text-sky-400" />
            <span className="font-semibold tracking-wide text-zinc-200">LDoc IDE</span>
            <span>File</span>
            <span>Edit</span>
            <span>Selection</span>
            <span>View</span>
            <span>Run</span>
            <span>Terminal</span>
            <span>Help</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Bell className="h-4 w-4" />
            <Settings className="h-4 w-4" />
          </div>
        </header>

        <div className="grid flex-1 grid-cols-[46px_280px_1fr] overflow-hidden">
          <aside className="border-r border-zinc-800 bg-[#161922] py-3">
            <div className="flex flex-col items-center gap-3 text-zinc-500">
              <Button size="icon" variant="ghost" className="h-9 w-9 text-zinc-100 hover:bg-zinc-800">
                <FileCode2 className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100">
                <Search className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100">
                <GitBranch className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100">
                <Play className="h-5 w-5" />
              </Button>
            </div>
          </aside>

          <aside className="flex flex-col border-r border-zinc-800 bg-[#1b202b]">
            <div className="border-b border-zinc-800 p-3">
              <p className="text-xs font-medium tracking-[0.18em] text-zinc-400">EXPLORER</p>
              <Input
                value="ldoc"
                readOnly
                className="mt-3 h-8 border-zinc-700 bg-[#121720] text-xs text-zinc-300"
              />
            </div>
            <div className="overflow-y-auto py-2">{renderTree(tree, 0, activeFileId, openFile, openFolders, setOpenFolders)}</div>
          </aside>

          <main className="grid grid-rows-[38px_1fr_170px] overflow-hidden bg-[#1f2430]">
            <div className="flex items-center overflow-x-auto border-b border-zinc-800 bg-[#1a1f2d]">
              {openTabs.map((tabId) => {
                const tabFile = files.find((entry) => entry.id === tabId);
                if (!tabFile) return null;
                const active = tabId === activeFileId;
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActiveFileId(tabId)}
                    className={cn(
                      "group flex h-full items-center gap-2 border-r border-zinc-800 px-3 text-xs",
                      active ? "bg-[#1f2430] text-zinc-100" : "bg-[#1a1f2d] text-zinc-400 hover:text-zinc-100",
                    )}
                  >
                    {iconMap[tabFile.icon]}
                    <span>{tabFile.name}</span>
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tabId);
                      }}
                      className="rounded px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                    >
                      ×
                    </span>
                  </button>
                );
              })}
            </div>

            <section className="grid grid-cols-[60px_1fr] overflow-hidden">
              <div className="overflow-y-auto border-r border-zinc-800 bg-[#1a1f2d] py-4 text-right text-xs leading-6 text-zinc-500">
                {lineNumbers.map((line) => (
                  <div key={line} className="pr-3 font-mono">
                    {line}
                  </div>
                ))}
              </div>
              <div className="overflow-auto p-4">
                <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                  <span>src</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>{activeFile.name}</span>
                  <span className="rounded bg-sky-500/10 px-2 py-0.5 text-sky-300">{activeFile.language}</span>
                </div>
                <pre className="font-mono text-sm leading-6 text-zinc-100">
                  <code>{activeFile.content}</code>
                </pre>
              </div>
            </section>

            <section className="border-t border-zinc-800 bg-[#171b25]">
              <div className="flex h-9 items-center gap-1 border-b border-zinc-800 px-2 text-xs">
                {(["problems", "output", "terminal"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTerminalMode(tab)}
                    className={cn(
                      "rounded px-3 py-1 capitalize",
                      terminalMode === tab ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800",
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="h-[130px] overflow-auto px-4 py-3 font-mono text-xs text-zinc-300">
                {terminalMode === "terminal" && (
                  <>
                    <p>$ npm run dev</p>
                    <p className="text-emerald-300">✓ VITE ready in 242ms</p>
                    <p className="text-zinc-500">Local: http://localhost:8080/code</p>
                    <p className="mt-2">$ npm run lint</p>
                    <p className="text-amber-300">0 errors, 0 warnings</p>
                  </>
                )}
                {terminalMode === "output" && (
                  <>
                    <p>[Info] Workspace initialized.</p>
                    <p>[Info] TypeScript server started.</p>
                    <p>[Hint] Use command palette for refactors.</p>
                  </>
                )}
                {terminalMode === "problems" && (
                  <>
                    <p className="text-emerald-300 flex items-center gap-2">
                      <Check className="h-3.5 w-3.5" /> No problems have been detected in the workspace.
                    </p>
                  </>
                )}
              </div>
            </section>
          </main>
        </div>

        <footer className="flex h-7 items-center justify-between border-t border-zinc-800 bg-[#0d111b] px-3 text-[11px] text-zinc-300">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-sky-300">
              <GitBranch className="h-3.5 w-3.5" /> main
            </span>
            <span>TypeScript React</span>
            <span>UTF-8</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Terminal className="h-3.5 w-3.5" /> Ready
            </span>
            <span>Ln 12, Col 18</span>
            <span>Spaces: 2</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default CodeEditor;
