export type Locale = 'en' | 'es' | 'fr' | 'de';

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export const defaultLocale: Locale = 'en';

export const translationMessages = {
  en: {
    placeholder: 'Start writing something amazing...',
    untitledDocument: 'Untitled Document',
    saveSuccess: 'Document saved',
    unsavedConfirm: 'You have unsaved changes. Create a new document anyway?',
    toggleTheme: 'Toggle dark mode',
    unsavedChanges: 'Unsaved changes',
    saved: 'Saved',
    documentName: 'Document name',
    words: 'words',
    characters: 'characters',
    lastSaved: 'Last saved',
    language: 'Language',
    notFoundTitle: 'Oops! Page not found',
    notFoundCta: 'Return to Home',
    notFoundDescription: 'The page you requested could not be found.',
  },
  es: {
    placeholder: 'Empieza a escribir algo increíble...',
    untitledDocument: 'Documento sin título',
    saveSuccess: 'Documento guardado',
    unsavedConfirm: 'Tienes cambios sin guardar. ¿Crear un documento nuevo de todos modos?',
    toggleTheme: 'Cambiar modo oscuro',
    unsavedChanges: 'Cambios sin guardar',
    saved: 'Guardado',
    documentName: 'Nombre del documento',
    words: 'palabras',
    characters: 'caracteres',
    lastSaved: 'Último guardado',
    language: 'Idioma',
    notFoundTitle: '¡Ups! Página no encontrada',
    notFoundCta: 'Volver al inicio',
    notFoundDescription: 'No se pudo encontrar la página solicitada.',
  },
  fr: {
    placeholder: 'Commencez à écrire quelque chose d’incroyable...',
    untitledDocument: 'Document sans titre',
    saveSuccess: 'Document enregistré',
    unsavedConfirm: 'Vous avez des modifications non enregistrées. Créer un nouveau document quand même ?',
    toggleTheme: 'Basculer le mode sombre',
    unsavedChanges: 'Modifications non enregistrées',
    saved: 'Enregistré',
    documentName: 'Nom du document',
    words: 'mots',
    characters: 'caractères',
    lastSaved: 'Dernière sauvegarde',
    language: 'Langue',
    notFoundTitle: 'Oups ! Page introuvable',
    notFoundCta: 'Retour à l’accueil',
    notFoundDescription: 'La page demandée est introuvable.',
  },
  de: {
    placeholder: 'Schreibe etwas Großartiges...',
    untitledDocument: 'Unbenanntes Dokument',
    saveSuccess: 'Dokument gespeichert',
    unsavedConfirm: 'Du hast ungespeicherte Änderungen. Trotzdem ein neues Dokument erstellen?',
    toggleTheme: 'Dunkelmodus umschalten',
    unsavedChanges: 'Ungespeicherte Änderungen',
    saved: 'Gespeichert',
    documentName: 'Dokumentname',
    words: 'Wörter',
    characters: 'Zeichen',
    lastSaved: 'Zuletzt gespeichert',
    language: 'Sprache',
    notFoundTitle: 'Hoppla! Seite nicht gefunden',
    notFoundCta: 'Zur Startseite',
    notFoundDescription: 'Die angeforderte Seite wurde nicht gefunden.',
  },
} as const;

export type TranslationKey = keyof typeof translationMessages.en;

export const getLocaleFromStorage = (): Locale => {
  if (typeof window === 'undefined') return defaultLocale;
  const stored = window.localStorage.getItem('lwrite-locale');
  if (stored && stored in translationMessages) {
    return stored as Locale;
  }
  return defaultLocale;
};

export const setLocaleInStorage = (locale: Locale) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('lwrite-locale', locale);
};

export const t = (locale: Locale, key: TranslationKey): string => {
  return translationMessages[locale]?.[key] ?? translationMessages[defaultLocale][key];
};
