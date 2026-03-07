import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useSEO } from "@/hooks/useSEO";
import { getBrowserLocale, t } from "@/lib/translations";

const NotFound = () => {
  const location = useLocation();
  const locale = getBrowserLocale();

  useSEO({
    title: "404 | LWrite",
    description: t(locale, "notFoundDescription"),
    noIndex: true,
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t(locale, "notFoundTitle")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t(locale, "notFoundCta")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
