import { RichTextEditor } from "@/components/Editor/RichTextEditor";
import { useSEO } from "@/hooks/useSEO";
import { siteConfig } from "@/lib/siteConfig";

const HOME_TITLE = "LWrite – Free Online Rich Text Editor | Private, No Sign-up";
const HOME_DESCRIPTION =
  "Free private online rich text editor in your browser. Write, format & export DOCX, PDF, ODT — no sign-up, with autosave and version history.";

const Index = () => {
  useSEO({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonicalPath: "/",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebApplication",
          name: "LWrite",
          url: siteConfig.siteUrl,
          applicationCategory: "BusinessApplication",
          applicationSubCategory: "Rich Text Editor",
          operatingSystem: "Web browser",
          browserRequirements: "Requires JavaScript. Requires HTML5.",
          description: HOME_DESCRIPTION,
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList:
            "Rich text editing, autosave, version history, document library, DOCX/PDF/ODT/RTF/HTML/TXT export, offline-first local storage",
          inLanguage: ["en", "de", "es", "fr", "it", "pt", "nl", "ja", "zh", "ar", "ru"],
        },
        {
          "@type": "WebSite",
          name: "LWrite",
          url: siteConfig.siteUrl,
          inLanguage: ["en", "de"],
        },
      ],
    },
  });

  return (
    <>
      {/* Screen-reader/crawler heading: visually hidden so the UI stays uncluttered. */}
      <h1 className="sr-only">LWrite – Free online rich text editor, private and without sign-up</h1>
      <p className="sr-only">
        Write, format and export documents entirely in your browser. Your documents stay on your
        device, with autosave and version history.
      </p>
      <RichTextEditor />
    </>
  );
};

export default Index;
