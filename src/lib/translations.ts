export type Locale = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'zh' | 'ar' | 'ru';

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
  it: {
    placeholder: 'Inizia a scrivere qualcosa di fantastico...',
    untitledDocument: 'Documento senza titolo',
    saveSuccess: 'Documento salvato',
    unsavedConfirm: 'Hai modifiche non salvate. Vuoi comunque creare un nuovo documento?',
    toggleTheme: 'Attiva/disattiva modalità scura',
    unsavedChanges: 'Modifiche non salvate',
    saved: 'Salvato',
    documentName: 'Nome documento',
    words: 'parole',
    characters: 'caratteri',
    lastSaved: 'Ultimo salvataggio',
    language: 'Lingua',
    notFoundTitle: 'Ops! Pagina non trovata',
    notFoundCta: 'Torna alla home',
    notFoundDescription: 'La pagina richiesta non è stata trovata.',
  },
  pt: {
    placeholder: 'Comece a escrever algo incrível...',
    untitledDocument: 'Documento sem título',
    saveSuccess: 'Documento salvo',
    unsavedConfirm: 'Você tem alterações não salvas. Criar um novo documento mesmo assim?',
    toggleTheme: 'Alternar modo escuro',
    unsavedChanges: 'Alterações não salvas',
    saved: 'Salvo',
    documentName: 'Nome do documento',
    words: 'palavras',
    characters: 'caracteres',
    lastSaved: 'Último salvamento',
    language: 'Idioma',
    notFoundTitle: 'Ops! Página não encontrada',
    notFoundCta: 'Voltar para a página inicial',
    notFoundDescription: 'A página solicitada não foi encontrada.',
  },
  nl: {
    placeholder: 'Begin met iets geweldigs te schrijven...',
    untitledDocument: 'Naamloos document',
    saveSuccess: 'Document opgeslagen',
    unsavedConfirm: 'Je hebt niet-opgeslagen wijzigingen. Toch een nieuw document maken?',
    toggleTheme: 'Donkere modus schakelen',
    unsavedChanges: 'Niet-opgeslagen wijzigingen',
    saved: 'Opgeslagen',
    documentName: 'Documentnaam',
    words: 'woorden',
    characters: 'tekens',
    lastSaved: 'Laatst opgeslagen',
    language: 'Taal',
    notFoundTitle: 'Oeps! Pagina niet gevonden',
    notFoundCta: 'Terug naar home',
    notFoundDescription: 'De opgevraagde pagina kon niet worden gevonden.',
  },
  ja: {
    placeholder: 'すばらしい文章を書き始めましょう...',
    untitledDocument: '無題のドキュメント',
    saveSuccess: 'ドキュメントを保存しました',
    unsavedConfirm: '未保存の変更があります。それでも新しいドキュメントを作成しますか？',
    toggleTheme: 'ダークモードを切り替え',
    unsavedChanges: '未保存の変更',
    saved: '保存済み',
    documentName: 'ドキュメント名',
    words: '語',
    characters: '文字',
    lastSaved: '最終保存',
    language: '言語',
    notFoundTitle: 'おっと！ページが見つかりません',
    notFoundCta: 'ホームに戻る',
    notFoundDescription: 'リクエストされたページが見つかりませんでした。',
  },
  zh: {
    placeholder: '开始写点精彩内容吧…',
    untitledDocument: '未命名文档',
    saveSuccess: '文档已保存',
    unsavedConfirm: '你有未保存的更改。仍要创建新文档吗？',
    toggleTheme: '切换深色模式',
    unsavedChanges: '未保存更改',
    saved: '已保存',
    documentName: '文档名称',
    words: '词',
    characters: '字符',
    lastSaved: '上次保存',
    language: '语言',
    notFoundTitle: '糟糕！找不到页面',
    notFoundCta: '返回首页',
    notFoundDescription: '未找到你请求的页面。',
  },
  ar: {
    placeholder: 'ابدأ بكتابة شيء رائع...',
    untitledDocument: 'مستند بدون عنوان',
    saveSuccess: 'تم حفظ المستند',
    unsavedConfirm: 'لديك تغييرات غير محفوظة. هل تريد إنشاء مستند جديد على أي حال؟',
    toggleTheme: 'تبديل الوضع الداكن',
    unsavedChanges: 'تغييرات غير محفوظة',
    saved: 'تم الحفظ',
    documentName: 'اسم المستند',
    words: 'كلمات',
    characters: 'أحرف',
    lastSaved: 'آخر حفظ',
    language: 'اللغة',
    notFoundTitle: 'عذرًا! الصفحة غير موجودة',
    notFoundCta: 'العودة إلى الرئيسية',
    notFoundDescription: 'تعذر العثور على الصفحة المطلوبة.',
  },
  ru: {
    placeholder: 'Начните писать что-нибудь потрясающее...',
    untitledDocument: 'Документ без названия',
    saveSuccess: 'Документ сохранён',
    unsavedConfirm: 'У вас есть несохранённые изменения. Всё равно создать новый документ?',
    toggleTheme: 'Переключить тёмную тему',
    unsavedChanges: 'Несохранённые изменения',
    saved: 'Сохранено',
    documentName: 'Название документа',
    words: 'слов',
    characters: 'символов',
    lastSaved: 'Последнее сохранение',
    language: 'Язык',
    notFoundTitle: 'Упс! Страница не найдена',
    notFoundCta: 'Вернуться на главную',
    notFoundDescription: 'Запрошенная страница не найдена.',
  },
} as const;

export type TranslationKey = keyof typeof translationMessages.en;

const normalizeToSupportedLocale = (languageTag: string): Locale | null => {
  const normalized = languageTag.toLowerCase();
  if (normalized in translationMessages) {
    return normalized as Locale;
  }

  const baseLanguage = normalized.split('-')[0];
  if (baseLanguage in translationMessages) {
    return baseLanguage as Locale;
  }

  return null;
};

export const getBrowserLocale = (): Locale => {
  if (typeof window === 'undefined') return defaultLocale;

  const browserLocales = window.navigator.languages.length > 0
    ? window.navigator.languages
    : [window.navigator.language];

  for (const browserLocale of browserLocales) {
    const matchedLocale = normalizeToSupportedLocale(browserLocale);
    if (matchedLocale) {
      return matchedLocale;
    }
  }

  return defaultLocale;
};

export const t = (locale: Locale, key: TranslationKey): string => {
  return translationMessages[locale]?.[key] ?? translationMessages[defaultLocale][key];
};
