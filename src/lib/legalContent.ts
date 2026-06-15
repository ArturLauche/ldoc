import { siteConfig } from './siteConfig';
import { formatMessage, type Locale } from './translations';

export interface LegalBlock {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalCopy {
  /** Page heading. */
  title: string;
  /** Short paragraph shown directly under the heading. */
  intro: string;
  /** Label preceding the configured last-updated date. */
  lastUpdatedLabel: string;
  /** Heading for the controller/contact card. */
  contactHeading: string;
  /** Neutral text shown when no contact has been configured yet. */
  contactPlaceholder: string;
  /** Developer-only hint (rendered only in dev builds) when contact is missing. */
  contactDevHint: string;
  contactNameLabel: string;
  contactEmailLabel: string;
  contactUrlLabel: string;
  jurisdictionLabel: string;
  /** Long-form sections. */
  blocks: LegalBlock[];
}

const v = {
  name: siteConfig.siteName,
  url: siteConfig.siteUrl,
  jurisdiction: siteConfig.jurisdiction,
};

// NOTE ON WEB FONTS: `index.html` loads the "DM Sans" and "Crimson Pro" web
// fonts from Google Fonts (fonts.googleapis.com / fonts.gstatic.com). That is a
// real third-party request that exposes the visitor's IP to Google, so it is
// disclosed below. If an operator self-hosts these fonts instead, update the
// "Web fonts" section and the Google Fonts recipient bullet accordingly.

const privacyEn: LegalCopy = {
  title: 'Privacy Policy',
  intro: formatMessage(
    '{name} ({url}) is a non-commercial hobby project. This page explains, in plain language, what data is involved when you use it and what your rights are.',
    v,
  ),
  lastUpdatedLabel: 'Last updated',
  contactHeading: 'Responsible party / contact',
  contactPlaceholder:
    'No contact details have been configured for this deployment yet. For privacy-related requests, please reach the site operator through the same channel where you found this site.',
  contactDevHint:
    'Developer note: set VITE_LEGAL_CONTACT_EMAIL — a single contact email is enough — to show real contact details here. See .env.example.',
  contactNameLabel: 'Responsible party',
  contactEmailLabel: 'Email',
  contactUrlLabel: 'Contact',
  jurisdictionLabel: 'Jurisdiction',
  blocks: [
    {
      heading: 'About this project',
      paragraphs: [
        formatMessage(
          '{name} is a free, non-commercial hobby project. It is a browser-only ("local-first") rich text editor: there is no user account, no server-side database, and no cloud sync. The documents you write, your version history, and your theme and language preferences are stored only in your own browser (in localStorage) and are not transmitted to us.',
          v,
        ),
        'This means that, for the core editing features, your content never leaves your device. The sections below explain the few cases where data is nevertheless processed — mainly technical server logs at the hosting provider and web fonts loaded from a third party.',
      ],
    },
    {
      heading: 'What data is processed',
      bullets: [
        'Server access data: when your browser loads the site, the hosting/CDN provider may process technically necessary access data such as IP address, date and time, the requested URL, the user agent and — where the browser sends it — the referrer, plus error, security and hosting/CDN logs.',
        'Web fonts: the page loads display fonts from Google Fonts. When the page opens, your browser requests these fonts from Google servers, which can process your IP address and request metadata (see "Web fonts" below).',
        'Content you enter into the editor: text, formatting, imported documents and uploaded images are processed locally in your browser and saved to local storage on your device. They are not sent to a server operated by this project.',
        'Technically necessary local storage: the app stores documents, version history and small UI preferences in your browser. It does not set tracking cookies.',
        'Preferences: your selected theme (light/dark) and language are stored locally so the app remembers them.',
        'Printing and export: if you use the print or export function, the document is rendered in your browser and handed to your own browser/operating system (for example to a printer or a saved file). This project does not receive a copy.',
        'Image URLs you choose: if you insert an image by URL, your browser loads that image directly from the third-party server you chose, which can see your IP address and request details.',
      ],
    },
    {
      heading: 'Legal basis (GDPR)',
      bullets: [
        'Legitimate interest (Art. 6(1)(f) GDPR): operating the site securely and reliably, including technically necessary server, security and error logs, and loading web fonts for a consistent, legible presentation.',
        'Performance of a function you request (Art. 6(1)(b)/(f) GDPR): carrying out actions you intentionally trigger, such as loading an image from a URL you entered, printing or exporting.',
        'Consent (Art. 6(1)(a) GDPR): only required for optional analytics, tracking, marketing cookies or non-essential third-party embeds. This project uses none, so no consent is requested.',
      ],
    },
    {
      heading: 'Web fonts',
      paragraphs: [
        'The interface uses the "DM Sans" and "Crimson Pro" fonts, which are loaded from the Google Fonts service (provided by Google Ireland Limited / Google LLC). When you open a page, your browser connects to Google servers to download these fonts, and Google can thereby process your IP address. No font-related cookies are set by this project, and the fonts are used only to display the interface consistently. If you want to avoid this third-party request, you can block external fonts in your browser; the app stays fully usable with fallback system fonts.',
      ],
    },
    {
      heading: 'Retention',
      paragraphs: [
        'Documents and preferences stay in your browser until you delete them, clear your browser storage, or the browser removes them. Version history is capped at a small number of recent versions per document.',
        'Server, security and hosting/CDN logs are controlled by the hosting provider and are kept only as long as needed for operation, security and debugging, unless a specific retention period is configured by the operator or required by law.',
      ],
    },
    {
      heading: 'Recipients / providers',
      bullets: [
        'Hosting / CDN provider: the static site is delivered by a hosting and CDN/security provider (for the official deployment this is Cloudflare Pages; self-hosted copies may use a different provider depending on deployment configuration).',
        'Google Fonts (Google Ireland Limited / Google LLC): web fonts are loaded from Google’s servers when you open the site.',
        'Image hosts you choose: only when you insert an image by URL, your browser contacts that third-party server.',
        'No analytics, advertising, tracking, session recording, external database, authentication provider or email-delivery service is used by this project.',
      ],
    },
    {
      heading: 'Cookies and local storage',
      paragraphs: [
        'This project does not use advertising, analytics or tracking cookies and does not embed third-party analytics or tracking scripts. It only uses technically necessary browser local storage to keep your documents and preferences on your device, plus the web fonts described above. Because none of this requires consent under the GDPR, there is no cookie consent banner.',
      ],
    },
    {
      heading: 'Data security',
      paragraphs: [
        'The site is served over an encrypted HTTPS connection (provided by the hosting/CDN provider). Because the editor is local-first, your documents stay on your device and are not exposed to a server. Document HTML is passed through a strict sanitizer before it is stored, restored, previewed or exported, which reduces the risk from malicious content in imported files.',
      ],
    },
    {
      heading: 'International data transfers',
      paragraphs: [
        'The editing itself happens on your own device. Where server logs or web-font requests are processed, the hosting/CDN provider and Google may operate infrastructure in the EU and in third countries (such as the USA), depending on deployment and routing. Such providers rely on their own safeguards (for example EU standard contractual clauses) for any transfer outside the EU/EEA.',
      ],
    },
    {
      heading: 'Children',
      paragraphs: [
        'This project is a general-purpose writing tool and is not directed at children. If you are below the age of digital consent that applies in your country, please use it only with the involvement of a parent or guardian.',
      ],
    },
    {
      heading: 'What this project does not do',
      bullets: [
        'No advertising, no marketing, no selling or sharing of personal data.',
        'No analytics, no tracking pixels, no heatmaps, no session recording.',
        'No profiling and no automated decision-making within the meaning of Art. 22 GDPR.',
        'No newsletter and no unsolicited contact.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'Under the GDPR you have the right to access, rectification, erasure, restriction of processing, data portability and objection regarding your personal data, and the right to lodge a complaint with a data protection supervisory authority. Where processing is based on consent, you can withdraw it at any time with effect for the future.',
        'Because documents are stored only in your browser, you remain in direct control of them: you can view, change, export or delete them at any time in the app or by clearing your browser storage. For requests concerning server-side logs, please use the contact above.',
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        'This policy may be updated as the project evolves. The date above reflects the last review.',
      ],
    },
  ],
};

const privacyDe: LegalCopy = {
  title: 'Datenschutzerklärung',
  intro: formatMessage(
    '{name} ({url}) ist ein nicht-kommerzielles Hobbyprojekt. Diese Seite erklärt in einfacher Sprache, welche Daten bei der Nutzung anfallen und welche Rechte du hast.',
    v,
  ),
  lastUpdatedLabel: 'Zuletzt aktualisiert',
  contactHeading: 'Verantwortlich / Kontakt',
  contactPlaceholder:
    'Für diese Bereitstellung wurden noch keine Kontaktdaten hinterlegt. Für datenschutzbezogene Anfragen wende dich bitte über denselben Kanal an den Betreiber, über den du diese Seite gefunden hast.',
  contactDevHint:
    'Entwicklerhinweis: Hinterlege VITE_LEGAL_CONTACT_EMAIL – eine einzelne Kontakt-E-Mail genügt –, um hier echte Kontaktdaten anzuzeigen. Siehe .env.example.',
  contactNameLabel: 'Verantwortlich',
  contactEmailLabel: 'E-Mail',
  contactUrlLabel: 'Kontakt',
  jurisdictionLabel: 'Zuständigkeit',
  blocks: [
    {
      heading: 'Über dieses Projekt',
      paragraphs: [
        formatMessage(
          '{name} ist ein kostenloses, nicht-kommerzielles Hobbyprojekt. Es ist ein reiner Browser-Editor („local-first"): Es gibt kein Benutzerkonto, keine serverseitige Datenbank und keine Cloud-Synchronisierung. Die von dir geschriebenen Dokumente, dein Versionsverlauf sowie deine Theme- und Spracheinstellungen werden ausschließlich in deinem eigenen Browser (in localStorage) gespeichert und nicht an uns übertragen.',
          v,
        ),
        'Für die zentralen Editor-Funktionen verlassen deine Inhalte also dein Gerät nicht. Die folgenden Abschnitte erläutern die wenigen Fälle, in denen dennoch Daten verarbeitet werden – vor allem technische Server-Logs beim Hosting-Anbieter sowie Web-Schriftarten, die von einem Dritten geladen werden.',
      ],
    },
    {
      heading: 'Welche Daten verarbeitet werden',
      bullets: [
        'Server-Zugriffsdaten: Wenn dein Browser die Seite lädt, verarbeitet der Hosting-/CDN-Anbieter technisch notwendige Zugriffsdaten wie IP-Adresse, Datum und Uhrzeit, die angeforderte URL, den User-Agent und – sofern der Browser ihn sendet – den Referrer sowie Fehler-, Sicherheits- und Hosting-/CDN-Logs.',
        'Web-Schriftarten: Die Seite lädt Anzeige-Schriftarten von Google Fonts. Beim Öffnen der Seite fordert dein Browser diese Schriftarten von Google-Servern an, die dabei deine IP-Adresse und Anfrage-Metadaten verarbeiten können (siehe „Web-Schriftarten" unten).',
        'Von dir eingegebene Inhalte: Texte, Formatierungen, importierte Dokumente und hochgeladene Bilder werden lokal in deinem Browser verarbeitet und auf deinem Gerät gespeichert. Sie werden nicht an einen Server dieses Projekts gesendet.',
        'Technisch notwendiger lokaler Speicher: Die App speichert Dokumente, Versionsverlauf und kleine UI-Einstellungen in deinem Browser. Es werden keine Tracking-Cookies gesetzt.',
        'Einstellungen: Dein gewähltes Theme (hell/dunkel) und deine Sprache werden lokal gespeichert, damit die App sie sich merkt.',
        'Drucken und Export: Wenn du die Druck- oder Exportfunktion nutzt, wird das Dokument in deinem Browser erzeugt und an deinen eigenen Browser bzw. dein Betriebssystem übergeben (z. B. an einen Drucker oder eine gespeicherte Datei). Dieses Projekt erhält keine Kopie.',
        'Von dir gewählte Bild-URLs: Wenn du ein Bild per URL einfügst, lädt dein Browser dieses Bild direkt vom gewählten Server des Dritten, der dabei deine IP-Adresse und Anfragedetails sehen kann.',
      ],
    },
    {
      heading: 'Rechtsgrundlage (DSGVO)',
      bullets: [
        'Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO): sicherer und zuverlässiger Betrieb der Seite, einschließlich technisch notwendiger Server-, Sicherheits- und Fehlerprotokolle, sowie das Laden von Web-Schriftarten für eine einheitliche, gut lesbare Darstellung.',
        'Erfüllung einer von dir angeforderten Funktion (Art. 6 Abs. 1 lit. b/f DSGVO): Ausführung von Aktionen, die du bewusst auslöst, etwa das Laden eines Bildes von einer eingegebenen URL, das Drucken oder Exportieren.',
        'Einwilligung (Art. 6 Abs. 1 lit. a DSGVO): nur erforderlich für optionale Analyse, Tracking, Marketing-Cookies oder nicht notwendige Einbindungen Dritter. Dieses Projekt nutzt nichts davon, daher wird keine Einwilligung abgefragt.',
      ],
    },
    {
      heading: 'Web-Schriftarten',
      paragraphs: [
        'Die Oberfläche verwendet die Schriftarten „DM Sans" und „Crimson Pro", die über den Dienst Google Fonts (bereitgestellt von Google Ireland Limited / Google LLC) geladen werden. Beim Öffnen einer Seite verbindet sich dein Browser mit Google-Servern, um diese Schriftarten herunterzuladen; dabei kann Google deine IP-Adresse verarbeiten. Es werden keine schriftartbezogenen Cookies durch dieses Projekt gesetzt, und die Schriftarten dienen ausschließlich der einheitlichen Darstellung der Oberfläche. Wenn du diese Anfrage an Dritte vermeiden möchtest, kannst du externe Schriftarten in deinem Browser blockieren; die App bleibt mit System-Ersatzschriftarten voll nutzbar.',
      ],
    },
    {
      heading: 'Speicherdauer',
      paragraphs: [
        'Dokumente und Einstellungen verbleiben in deinem Browser, bis du sie löschst, den Browser-Speicher leerst oder der Browser sie entfernt. Der Versionsverlauf ist auf eine kleine Anzahl aktueller Versionen pro Dokument begrenzt.',
        'Server-, Sicherheits- und Hosting-/CDN-Logs werden vom Hosting-Anbieter verwaltet und nur so lange aufbewahrt, wie es für Betrieb, Sicherheit und Fehlersuche erforderlich ist, sofern nicht eine bestimmte Aufbewahrungsfrist konfiguriert oder gesetzlich vorgeschrieben ist.',
      ],
    },
    {
      heading: 'Empfänger / Anbieter',
      bullets: [
        'Hosting-/CDN-Anbieter: Die statische Seite wird über einen Hosting- und CDN-/Sicherheitsanbieter ausgeliefert (für die offizielle Bereitstellung ist dies Cloudflare Pages; selbst gehostete Kopien können je nach Konfiguration einen anderen Anbieter nutzen).',
        'Google Fonts (Google Ireland Limited / Google LLC): Web-Schriftarten werden beim Öffnen der Seite von Google-Servern geladen.',
        'Von dir gewählte Bild-Hosts: Nur wenn du ein Bild per URL einfügst, kontaktiert dein Browser den Server des Dritten.',
        'Es werden keine Analyse-, Werbe-, Tracking- oder Sitzungsaufzeichnungs-Tools, keine externe Datenbank, kein Authentifizierungsanbieter und kein E-Mail-Versanddienst verwendet.',
      ],
    },
    {
      heading: 'Cookies und lokaler Speicher',
      paragraphs: [
        'Dieses Projekt verwendet keine Werbe-, Analyse- oder Tracking-Cookies und bindet keine Analyse- oder Tracking-Skripte Dritter ein. Es nutzt ausschließlich technisch notwendigen lokalen Browser-Speicher, um deine Dokumente und Einstellungen auf deinem Gerät zu behalten, sowie die oben beschriebenen Web-Schriftarten. Da hierfür nach der DSGVO keine Einwilligung erforderlich ist, gibt es kein Cookie-Einwilligungsbanner.',
      ],
    },
    {
      heading: 'Datensicherheit',
      paragraphs: [
        'Die Seite wird über eine verschlüsselte HTTPS-Verbindung ausgeliefert (bereitgestellt durch den Hosting-/CDN-Anbieter). Da der Editor local-first arbeitet, verbleiben deine Dokumente auf deinem Gerät und sind keinem Server ausgesetzt. Dokument-HTML wird vor dem Speichern, Wiederherstellen, der Vorschau oder dem Export durch einen strengen Filter (Sanitizer) geleitet, was das Risiko durch schädliche Inhalte in importierten Dateien verringert.',
      ],
    },
    {
      heading: 'Internationale Datenübermittlungen',
      paragraphs: [
        'Die Bearbeitung selbst findet auf deinem eigenen Gerät statt. Soweit Server-Logs oder Anfragen für Web-Schriftarten verarbeitet werden, können der Hosting-/CDN-Anbieter und Google – je nach Bereitstellung und Routing – Infrastruktur in der EU und in Drittländern (etwa den USA) betreiben. Solche Anbieter stützen sich für Übermittlungen außerhalb der EU/des EWR auf eigene Garantien (zum Beispiel EU-Standardvertragsklauseln).',
      ],
    },
    {
      heading: 'Kinder',
      paragraphs: [
        'Dieses Projekt ist ein allgemeines Schreibwerkzeug und richtet sich nicht an Kinder. Wenn du das in deinem Land geltende Mindestalter für eine datenschutzrechtliche Einwilligung noch nicht erreicht hast, nutze es bitte nur unter Einbeziehung eines Erziehungsberechtigten.',
      ],
    },
    {
      heading: 'Was dieses Projekt nicht tut',
      bullets: [
        'Keine Werbung, kein Marketing, kein Verkauf oder Weitergabe personenbezogener Daten.',
        'Keine Analyse, keine Tracking-Pixel, keine Heatmaps, keine Sitzungsaufzeichnung.',
        'Kein Profiling und keine automatisierte Entscheidungsfindung im Sinne von Art. 22 DSGVO.',
        'Kein Newsletter und keine unaufgeforderte Kontaktaufnahme.',
      ],
    },
    {
      heading: 'Deine Rechte',
      paragraphs: [
        'Nach der DSGVO hast du das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch hinsichtlich deiner personenbezogenen Daten sowie das Recht, dich bei einer Datenschutzaufsichtsbehörde zu beschweren. Soweit eine Verarbeitung auf einer Einwilligung beruht, kannst du diese jederzeit mit Wirkung für die Zukunft widerrufen.',
        'Da Dokumente nur in deinem Browser gespeichert werden, behältst du die direkte Kontrolle darüber: Du kannst sie jederzeit in der App ansehen, ändern, exportieren oder löschen oder den Browser-Speicher leeren. Für Anfragen zu serverseitigen Logs nutze bitte den oben genannten Kontakt.',
      ],
    },
    {
      heading: 'Änderungen dieser Erklärung',
      paragraphs: [
        'Diese Erklärung kann mit der Weiterentwicklung des Projekts aktualisiert werden. Das oben genannte Datum gibt die letzte Überprüfung an.',
      ],
    },
  ],
};

const termsEn: LegalCopy = {
  title: 'Terms of Use',
  intro: formatMessage(
    '{name} is a non-commercial hobby project provided as-is. By using it you accept the simple, practical rules below.',
    v,
  ),
  lastUpdatedLabel: 'Last updated',
  contactHeading: 'Responsible party / contact',
  contactPlaceholder:
    'No contact details have been configured for this deployment yet. For requests about these terms, please reach the site operator through the same channel where you found this site.',
  contactDevHint:
    'Developer note: set VITE_LEGAL_CONTACT_EMAIL — a single contact email is enough — to show real contact details here. See .env.example.',
  contactNameLabel: 'Responsible party',
  contactEmailLabel: 'Email',
  contactUrlLabel: 'Contact',
  jurisdictionLabel: 'Jurisdiction',
  blocks: [
    {
      heading: 'No warranty',
      paragraphs: [
        'This is a free hobby project provided "as is" and "as available", without any warranty or guarantee of availability, fitness for a particular purpose, or correctness. Use it at your own risk.',
      ],
    },
    {
      heading: 'Availability and changes to the service',
      paragraphs: [
        'The project is offered voluntarily and free of charge. It may be changed, limited, suspended or discontinued at any time, in whole or in part, without prior notice. There is no entitlement to continued availability of the service or of any specific feature.',
      ],
    },
    {
      heading: 'Acceptable use',
      bullets: [
        'Use the project only for lawful purposes and in line with these terms.',
        'Do not use it for abuse, harassment, spam, excessive automation, scraping, denial-of-service attempts, credential abuse, malware, phishing or any attempt to circumvent technical limits or security.',
        'Do not attempt to disrupt, overload or gain unauthorized access to the service or its hosting infrastructure.',
        'Do not import, paste, embed or distribute illegal content or content you have no right to use.',
      ],
    },
    {
      heading: 'Your content and intellectual property',
      paragraphs: [
        'You keep all rights to the documents you create. This project claims no ownership of your content and does not receive a copy of it, because your documents stay in your own browser. You are responsible for ensuring that you hold the necessary rights to any text, images or files you import or insert.',
      ],
    },
    {
      heading: 'Your documents and backups',
      paragraphs: [
        'Your documents are stored only in your own browser. The project does not keep a copy. Clearing your browser storage, using private/incognito mode, or browser limits can remove your documents. You are responsible for keeping your own backups by exporting important documents.',
      ],
    },
    {
      heading: 'Imports, uploads and images',
      paragraphs: [
        'Imported documents and uploaded images are processed locally in your browser. Do not import or insert content that is illegal or that you are not allowed to use. When you insert an image by URL, your browser contacts that third-party server directly, and that server may log your request.',
      ],
    },
    {
      heading: 'Results may be imperfect',
      paragraphs: [
        'Editing, import, conversion and export results can be incomplete, outdated or wrong. Always review important documents before relying on them.',
      ],
    },
    {
      heading: 'Third-party services and links',
      paragraphs: [
        'The site relies on a hosting/CDN provider and loads web fonts from Google Fonts, and it may connect to image hosts you choose. These third parties have their own terms and privacy practices, for which this project is not responsible.',
      ],
    },
    {
      heading: 'Limitation of liability',
      paragraphs: [
        'To the extent permitted by applicable law, the operator is not liable for any loss of data or for indirect or consequential damages arising from the use of, or inability to use, this project. Nothing in these terms excludes or limits liability that cannot be excluded or limited under applicable law, including liability for intent or gross negligence and any mandatory statutory consumer rights.',
      ],
    },
    {
      heading: 'Changes and governing law',
      paragraphs: [
        formatMessage(
          'These terms may change as the project evolves; the date above reflects the last review. The project is operated from {jurisdiction}, and that law applies as far as legally possible; mandatory consumer-protection rules of your place of residence remain unaffected.',
          v,
        ),
      ],
    },
  ],
};

const termsDe: LegalCopy = {
  title: 'Nutzungsbedingungen',
  intro: formatMessage(
    '{name} ist ein nicht-kommerzielles Hobbyprojekt und wird ohne Gewähr bereitgestellt. Mit der Nutzung akzeptierst du die folgenden einfachen, praktischen Regeln.',
    v,
  ),
  lastUpdatedLabel: 'Zuletzt aktualisiert',
  contactHeading: 'Verantwortlich / Kontakt',
  contactPlaceholder:
    'Für diese Bereitstellung wurden noch keine Kontaktdaten hinterlegt. Für Anfragen zu diesen Bedingungen wende dich bitte über denselben Kanal an den Betreiber, über den du diese Seite gefunden hast.',
  contactDevHint:
    'Entwicklerhinweis: Hinterlege VITE_LEGAL_CONTACT_EMAIL – eine einzelne Kontakt-E-Mail genügt –, um hier echte Kontaktdaten anzuzeigen. Siehe .env.example.',
  contactNameLabel: 'Verantwortlich',
  contactEmailLabel: 'E-Mail',
  contactUrlLabel: 'Kontakt',
  jurisdictionLabel: 'Zuständigkeit',
  blocks: [
    {
      heading: 'Keine Gewährleistung',
      paragraphs: [
        'Dies ist ein kostenloses Hobbyprojekt, das „wie besehen" und „wie verfügbar" ohne jede Gewährleistung für Verfügbarkeit, Eignung für einen bestimmten Zweck oder Richtigkeit bereitgestellt wird. Die Nutzung erfolgt auf eigenes Risiko.',
      ],
    },
    {
      heading: 'Verfügbarkeit und Änderungen des Dienstes',
      paragraphs: [
        'Das Projekt wird freiwillig und kostenlos angeboten. Es kann jederzeit ganz oder teilweise geändert, eingeschränkt, ausgesetzt oder eingestellt werden, ohne vorherige Ankündigung. Es besteht kein Anspruch auf fortlaufende Verfügbarkeit des Dienstes oder einer bestimmten Funktion.',
      ],
    },
    {
      heading: 'Zulässige Nutzung',
      bullets: [
        'Nutze das Projekt nur für rechtmäßige Zwecke und im Einklang mit diesen Bedingungen.',
        'Keine missbräuchliche Nutzung, Belästigung, kein Spam, keine übermäßige Automatisierung, kein Scraping, keine Denial-of-Service-Versuche, kein Missbrauch von Zugangsdaten, keine Schadsoftware, kein Phishing und keine Versuche, technische Grenzen oder Sicherheitsmechanismen zu umgehen.',
        'Versuche nicht, den Dienst oder seine Hosting-Infrastruktur zu stören, zu überlasten oder unbefugt darauf zuzugreifen.',
        'Importiere, füge oder verbreite keine illegalen Inhalte oder Inhalte, zu deren Nutzung du nicht berechtigt bist.',
      ],
    },
    {
      heading: 'Deine Inhalte und geistiges Eigentum',
      paragraphs: [
        'Du behältst sämtliche Rechte an den von dir erstellten Dokumenten. Dieses Projekt beansprucht kein Eigentum an deinen Inhalten und erhält keine Kopie davon, da deine Dokumente in deinem eigenen Browser verbleiben. Du bist dafür verantwortlich, dass du über die erforderlichen Rechte an allen Texten, Bildern oder Dateien verfügst, die du importierst oder einfügst.',
      ],
    },
    {
      heading: 'Deine Dokumente und Sicherungen',
      paragraphs: [
        'Deine Dokumente werden ausschließlich in deinem eigenen Browser gespeichert. Das Projekt behält keine Kopie. Das Leeren des Browser-Speichers, der private/Inkognito-Modus oder Browser-Beschränkungen können deine Dokumente entfernen. Du bist selbst dafür verantwortlich, wichtige Dokumente durch Export zu sichern.',
      ],
    },
    {
      heading: 'Importe, Uploads und Bilder',
      paragraphs: [
        'Importierte Dokumente und hochgeladene Bilder werden lokal in deinem Browser verarbeitet. Importiere oder füge keine Inhalte ein, die illegal sind oder die du nicht verwenden darfst. Wenn du ein Bild per URL einfügst, kontaktiert dein Browser den Server des Dritten direkt, und dieser Server kann deine Anfrage protokollieren.',
      ],
    },
    {
      heading: 'Ergebnisse können fehlerhaft sein',
      paragraphs: [
        'Bearbeitungs-, Import-, Konvertierungs- und Exportergebnisse können unvollständig, veraltet oder falsch sein. Überprüfe wichtige Dokumente immer, bevor du dich darauf verlässt.',
      ],
    },
    {
      heading: 'Dienste und Links Dritter',
      paragraphs: [
        'Die Seite nutzt einen Hosting-/CDN-Anbieter und lädt Web-Schriftarten von Google Fonts; außerdem kann sie sich mit von dir gewählten Bild-Hosts verbinden. Diese Dritten haben eigene Bedingungen und Datenschutzpraktiken, für die dieses Projekt nicht verantwortlich ist.',
      ],
    },
    {
      heading: 'Haftungsbeschränkung',
      paragraphs: [
        'Soweit nach geltendem Recht zulässig, haftet der Betreiber nicht für Datenverluste oder für mittelbare oder Folgeschäden, die aus der Nutzung oder Nichtnutzbarkeit dieses Projekts entstehen. Diese Bedingungen schließen keine Haftung aus oder ein, die nach geltendem Recht nicht ausgeschlossen oder beschränkt werden kann, einschließlich der Haftung für Vorsatz und grobe Fahrlässigkeit sowie zwingender gesetzlicher Verbraucherrechte.',
      ],
    },
    {
      heading: 'Änderungen und anwendbares Recht',
      paragraphs: [
        formatMessage(
          'Diese Bedingungen können sich mit der Weiterentwicklung des Projekts ändern; das oben genannte Datum gibt die letzte Überprüfung an. Das Projekt wird aus {jurisdiction} betrieben, und dieses Recht gilt, soweit rechtlich möglich; zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben unberührt.',
          v,
        ),
      ],
    },
  ],
};

export function getPrivacyCopy(locale: Locale): LegalCopy {
  return locale === 'de' ? privacyDe : privacyEn;
}

export function getTermsCopy(locale: Locale): LegalCopy {
  return locale === 'de' ? termsDe : termsEn;
}
