import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  FileCode2,
  FolderTree,
  Globe,
  LayoutPanelTop,
  Play,
  Search,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type CodeFile = {
  name: string;
  language: string;
  content: string;
};

const starterFiles: CodeFile[] = [
  {
    name: "index.html",
    language: "HTML",
    content: `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VS Web Preview</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="card">
      <h1>Code Studio</h1>
      <p>Edit HTML/CSS and preview instantly.</p>
      <button id="btn">Click me</button>
    </main>
    <script src="app.js"></script>
  </body>
</html>`,
  },
  {
    name: "landing.html",
    language: "HTML",
    content: `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Landing</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="card">
      <h1>Secondary Page</h1>
      <p>You can choose which HTML file to preview from Settings.</p>
    </main>
  </body>
</html>`,
  },
  {
    name: "styles.css",
    language: "CSS",
    content: `:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
  font-family: Inter, system-ui, sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at top, #1f2937, #0f172a);
  color: #e2e8f0;
}

.card {
  background: rgba(30, 41, 59, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 2rem;
  border-radius: 1rem;
}`,
  },
  {
    name: "app.js",
    language: "JavaScript",
    content: `const button = document.getElementById("btn");
button?.addEventListener("click", () => {
  button.textContent = "Clicked ✅";
});`,
  },
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPreviewDocument = (files: CodeFile[], htmlName: string) => {
  const htmlFile = files.find((file) => file.name === htmlName);

  if (!htmlFile) {
    return "<h1>No preview file selected.</h1>";
  }

  const cssFiles = files.filter((file) => file.name.endsWith(".css"));
  const jsFiles = files.filter((file) => file.name.endsWith(".js"));

  let compiled = htmlFile.content;

  cssFiles.forEach((file) => {
    const pattern = new RegExp(
      `<link[^>]+href=["']${escapeRegExp(file.name)}["'][^>]*>`,
      "gi",
    );
    compiled = compiled.replace(pattern, "");
  });

  jsFiles.forEach((file) => {
    const pattern = new RegExp(
      `<script[^>]+src=["']${escapeRegExp(file.name)}["'][^>]*><\\/script>`,
      "gi",
    );
    compiled = compiled.replace(pattern, "");
  });

  const styleBlock = cssFiles.map((file) => `/* ${file.name} */\n${file.content}`).join("\n\n");
  const scriptBlock = jsFiles.map((file) => `/* ${file.name} */\n${file.content}`).join("\n\n");

  compiled = compiled.includes("</head>")
    ? compiled.replace("</head>", `<style>${styleBlock}</style></head>`)
    : `<style>${styleBlock}</style>${compiled}`;

  compiled = compiled.includes("</body>")
    ? compiled.replace("</body>", `<script>${scriptBlock}</${"script"}></body>`)
    : `${compiled}<script>${scriptBlock}</${"script"}>`;

  return compiled;
};

const CodeStudio = () => {
  const [activeFile, setActiveFile] = useState(starterFiles[0].name);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState(starterFiles);
  const [showSettings, setShowSettings] = useState(false);
  const [previewMode, setPreviewMode] = useState<"project" | "url">("project");
  const [previewUrl, setPreviewUrl] = useState("https://example.com");
  const [autoRun, setAutoRun] = useState(true);
  const [previewFile, setPreviewFile] = useState("index.html");

  const selectedFile = files.find((file) => file.name === activeFile) ?? files[0];

  const htmlFileNames = useMemo(
    () => files.filter((file) => file.name.endsWith(".html")).map((file) => file.name),
    [files],
  );

  const computedPreview = useMemo(
    () => buildPreviewDocument(files, previewFile),
    [files, previewFile],
  );

  const [renderedPreview, setRenderedPreview] = useState(computedPreview);

  useEffect(() => {
    if (htmlFileNames.length > 0 && !htmlFileNames.includes(previewFile)) {
      setPreviewFile(htmlFileNames[0]);
    }
  }, [htmlFileNames, previewFile]);

  useEffect(() => {
    if (autoRun) {
      setRenderedPreview(computedPreview);
    }
  }, [autoRun, computedPreview]);

  const updateContent = (value: string) => {
    setFiles((prev) =>
      prev.map((file) =>
        file.name === selectedFile.name
          ? {
              ...file,
              content: value,
            }
          : file,
      ),
    );
  };

  return (
    <main className="app-shell min-h-screen p-4 md:p-6">
      <section className="mx-auto flex h-[calc(100vh-2rem)] max-w-[1650px] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/70 shadow-floating backdrop-blur-xl md:h-[calc(100vh-3rem)]">
        <header className="glass-bar flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <LayoutPanelTop className="h-4 w-4" />
            <p className="text-sm font-semibold">Code Studio / VS Web</p>
            <Badge variant="secondary" className="rounded-full">
              /code
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenderedPreview(computedPreview)}
            >
              <Play className="mr-1 h-4 w-4" />
              Run
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings((prev) => !prev)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_minmax(360px,40%)]">
          <aside className="glass-card m-3 hidden min-h-0 flex-col p-3 xl:flex">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <FolderTree className="h-4 w-4" /> Explorer
            </div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-7"
                placeholder="Search files"
              />
            </div>
            <div className="space-y-1 overflow-auto">
              {files
                .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
                .map((file) => (
                  <button
                    key={file.name}
                    onClick={() => setActiveFile(file.name)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${
                      file.name === selectedFile.name
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FileCode2 className="h-3.5 w-3.5" />
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{file.language}</span>
                  </button>
                ))}
            </div>
          </aside>

          <section className="m-3 mr-1 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-background/75">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-sm">
              <FileCode2 className="h-4 w-4" />
              <span className="font-medium">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">{selectedFile.language}</span>
            </div>
            <textarea
              value={selectedFile.content}
              onChange={(event) => updateContent(event.target.value)}
              spellCheck={false}
              className="h-full min-h-[320px] flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 text-foreground outline-none"
            />
          </section>

          <section className="m-3 ml-1 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-background/75">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Eye className="h-4 w-4" /> Live Site Viewer
              </div>
              <Badge variant="outline" className="rounded-full">
                {previewMode === "project" ? "Project Preview" : "Website URL"}
              </Badge>
            </div>
            <div className="space-y-3 border-b border-border/40 p-3">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={previewMode === "project" ? "default" : "outline"}
                  onClick={() => setPreviewMode("project")}
                >
                  Project
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === "url" ? "default" : "outline"}
                  onClick={() => setPreviewMode("url")}
                >
                  <Globe className="mr-1 h-3.5 w-3.5" />
                  Website
                </Button>
              </div>

              {showSettings && previewMode === "project" && (
                <div className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2 text-sm">
                  <label className="text-xs text-muted-foreground">Preview entry file</label>
                  <select
                    value={previewFile}
                    onChange={(event) => setPreviewFile(event.target.value)}
                    className="h-8 rounded-md border border-border bg-background px-2"
                  >
                    {htmlFileNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={autoRun}
                      onChange={(event) => setAutoRun(event.target.checked)}
                    />
                    Auto-run preview on file edits
                  </label>
                </div>
              )}

              {previewMode === "url" && (
                <div className="grid gap-2">
                  <Input
                    value={previewUrl}
                    onChange={(event) => setPreviewUrl(event.target.value)}
                    placeholder="https://example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Some websites block iframe embedding via security headers.
                  </p>
                </div>
              )}
            </div>
            <Separator />
            {previewMode === "project" ? (
              <iframe
                title="Site preview"
                sandbox="allow-scripts"
                srcDoc={renderedPreview}
                className="h-full min-h-[320px] w-full flex-1 bg-white"
              />
            ) : (
              <iframe
                title="Website viewer"
                sandbox="allow-scripts allow-same-origin allow-forms"
                src={previewUrl}
                className="h-full min-h-[320px] w-full flex-1 bg-white"
              />
            )}
          </section>
        </div>
      </section>
    </main>
  );
};

export default CodeStudio;
