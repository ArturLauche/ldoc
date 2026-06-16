import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { ConfirmProvider } from "@/components/confirm-provider";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <LocaleProvider>
      <ConfirmProvider>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Index />} />
              {/* Public privacy/terms pages. German aliases point at the same
                  pages so /datenschutz and /nutzung also resolve. */}
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/datenschutz" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/nutzung" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ConfirmProvider>
    </LocaleProvider>
  </ThemeProvider>
);

export default App;
