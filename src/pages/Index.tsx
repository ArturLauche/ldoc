import { RichTextEditor } from "@/components/Editor/RichTextEditor";
import { useSEO } from "@/hooks/useSEO";

const Index = () => {
  useSEO({
    title: "LWrite | Browser-Based Rich Text Editor",
    description:
      "Write, format, and export documents in your browser with autosave, version history, and modern editing tools.",
    canonicalPath: "/",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "LWrite",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Browser-based rich text editor with autosave, formatting controls, and version history.",
      url: window.location.origin,
    },
  });

  return <RichTextEditor />;
};

export default Index;
