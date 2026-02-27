import {
  INSERT_HEADING_COMMAND,
  ReactCodeblockPlugin,
  ReactImagePlugin,
  ReactLinkPlugin,
  ReactListPlugin,
} from "@lobehub/editor";
import { Editor, useEditor } from "@lobehub/editor/react";

const LobeEditorPage = () => {
  const editor = useEditor();

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <section className="mx-auto max-w-5xl rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:p-6">
        <h1 className="mb-4 text-xl font-semibold">LobeHub Editor</h1>
        <Editor
          editor={editor}
          placeholder="Start typing with LobeHub editor..."
          plugins={[ReactListPlugin, ReactLinkPlugin, ReactImagePlugin, ReactCodeblockPlugin]}
          slashOption={{
            items: [
              {
                key: "h1",
                label: "Heading 1",
                onSelect: (instance) => {
                  instance.dispatchCommand(INSERT_HEADING_COMMAND, { tag: "h1" });
                },
              },
              {
                key: "h2",
                label: "Heading 2",
                onSelect: (instance) => {
                  instance.dispatchCommand(INSERT_HEADING_COMMAND, { tag: "h2" });
                },
              },
            ],
          }}
        />
      </section>
    </main>
  );
};

export default LobeEditorPage;
