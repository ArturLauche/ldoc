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

const privacyEn: LegalCopy = {
  title: 'Privacy Policy',
  intro: formatMessage(
    '{name} ({url}) is a non-commercial hobby project. This page explains, in plain language, what data is involved when you use it.',
    v,
  ),
  lastUpdatedLabel: 'Last updated',
  contactHeading: 'Responsible party / contact',
  contactPlaceholder: 'Contact details are configured by the site operator.',
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
      ],
    },
    {
      heading: 'What data is processed',
      bullets: [
        'Server access data: when your browser loads the site, the hosting/CDN provider may process technically necessary access data such as IP address, date and time, the requested URL, the user agent and — where the browser sends it — the referrer, plus error, security and hosting/CDN logs.',
        'Content you enter into the editor: text, formatting, imported documents and uploaded images are processed locally in your browser and saved to local storage on your device. They are not sent to a server operated by this project.',
        'Technically necessary local storage: the app stores documents, version history and small UI preferences in your browser. It does not set tracking cookies.',
        'Preferences: your selected theme (light/dark) and language are stored locally so the app remembers them.',
        'Third-party calls: if you insert an image by URL, your browser loads that image directly from the third-party server you chose, which can see your IP address and request details.',
      ],
    },
    {
      heading: 'Legal basis (GDPR)',
      bullets: [
        'Legitimate interest (Art. 6(1)(f) GDPR): operating the site securely and reliably, including technically necessary server, security and error logs.',
        'Performance of a function you request (Art. 6(1)(b)/(f) GDPR): carrying out actions you intentionally trigger, such as loading an image from a URL you entered.',
        'Consent (Art. 6(1)(a) GDPR): only required for optional analytics, tracking, marketing cookies or non-essential third-party embeds. This project uses none, so no consent is requested.',
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
        'Image hosts you choose: only when you insert an image by URL, your browser contacts that third-party server.',
        'No analytics, advertising, tracking, session recording, external database, authentication provider or email service is used by this project.',
      ],
    },
    {
      heading: 'Cookies and local storage',
      paragraphs: [
        'This project does not use advertising, analytics or tracking cookies and does not embed third-party trackers. It only uses technically necessary browser local storage to keep your documents and preferences on your device. For this reason there is no cookie consent banner.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'Under the GDPR you have the right to access, rectification, erasure, restriction of processing and objection regarding your personal data, and the right to lodge a complaint with a data protection supervisory authority. Because documents are stored only in your browser, you can delete them at any time directly in the app or by clearing your browser storage. For requests concerning server-side logs, use the contact above.',
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
    '{name} ({url}) ist ein nicht-kommerzielles Hobbyprojekt. Diese Seite erklärt in einfacher Sprache, welche Daten bei der Nutzung anfallen.',
    v,
  ),
  lastUpdatedLabel: 'Zuletzt aktualisiert',
  contactHeading: 'Verantwortlich / Kontakt',
  contactPlaceholder: 'Die Kontaktdaten werden vom Betreiber der Seite konfiguriert.',
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
      ],
    },
    {
      heading: 'Welche Daten verarbeitet werden',
      bullets: [
        'Server-Zugriffsdaten: Wenn dein Browser die Seite lädt, verarbeitet der Hosting-/CDN-Anbieter technisch notwendige Zugriffsdaten wie IP-Adresse, Datum und Uhrzeit, die angeforderte URL, den User-Agent und – sofern der Browser ihn sendet – den Referrer sowie Fehler-, Sicherheits- und Hosting-/CDN-Logs.',
        'Von dir eingegebene Inhalte: Texte, Formatierungen, importierte Dokumente und hochgeladene Bilder werden lokal in deinem Browser verarbeitet und auf deinem Gerät gespeichert. Sie werden nicht an einen Server dieses Projekts gesendet.',
        'Technisch notwendiger lokaler Speicher: Die App speichert Dokumente, Versionsverlauf und kleine UI-Einstellungen in deinem Browser. Es werden keine Tracking-Cookies gesetzt.',
        'Einstellungen: Dein gewähltes Theme (hell/dunkel) und deine Sprache werden lokal gespeichert, damit die App sie sich merkt.',
        'Aufrufe Dritter: Wenn du ein Bild per URL einfügst, lädt dein Browser dieses Bild direkt vom gewählten Server des Dritten, der dabei deine IP-Adresse und Anfragedetails sehen kann.',
      ],
    },
    {
      heading: 'Rechtsgrundlage (DSGVO)',
      bullets: [
        'Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO): sicherer und zuverlässiger Betrieb der Seite, einschließlich technisch notwendiger Server-, Sicherheits- und Fehlerprotokolle.',
        'Erfüllung einer von dir angeforderten Funktion (Art. 6 Abs. 1 lit. b/f DSGVO): Ausführung von Aktionen, die du bewusst auslöst, etwa das Laden eines Bildes von einer eingegebenen URL.',
        'Einwilligung (Art. 6 Abs. 1 lit. a DSGVO): nur erforderlich für optionale Analyse, Tracking, Marketing-Cookies oder nicht notwendige Einbindungen Dritter. Dieses Projekt nutzt nichts davon, daher wird keine Einwilligung abgefragt.',
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
        'Von dir gewählte Bild-Hosts: Nur wenn du ein Bild per URL einfügst, kontaktiert dein Browser den Server des Dritten.',
        'Es werden keine Analyse-, Werbe-, Tracking- oder Sitzungsaufzeichnungs-Tools, keine externe Datenbank, kein Authentifizierungsanbieter und kein E-Mail-Dienst verwendet.',
      ],
    },
    {
      heading: 'Cookies und lokaler Speicher',
      paragraphs: [
        'Dieses Projekt verwendet keine Werbe-, Analyse- oder Tracking-Cookies und bindet keine Tracker Dritter ein. Es nutzt ausschließlich technisch notwendigen lokalen Browser-Speicher, um deine Dokumente und Einstellungen auf deinem Gerät zu behalten. Daher gibt es kein Cookie-Einwilligungsbanner.',
      ],
    },
    {
      heading: 'Deine Rechte',
      paragraphs: [
        'Nach der DSGVO hast du das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch hinsichtlich deiner personenbezogenen Daten sowie das Recht, dich bei einer Datenschutzaufsichtsbehörde zu beschweren. Da Dokumente nur in deinem Browser gespeichert werden, kannst du sie jederzeit direkt in der App oder durch Leeren des Browser-Speichers löschen. Für Anfragen zu serverseitigen Logs nutze den oben genannten Kontakt.',
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
  contactPlaceholder: 'Contact details are configured by the site operator.',
  contactNameLabel: 'Responsible party',
  contactEmailLabel: 'Email',
  contactUrlLabel: 'Contact',
  jurisdictionLabel: 'Jurisdiction',
  blocks: [
    {
      heading: 'No warranty',
      paragraphs: [
        'This is a free hobby project provided "as is", without any warranty or guarantee of availability, fitness for a particular purpose, or correctness. Use it at your own risk.',
      ],
    },
    {
      heading: 'Acceptable use',
      bullets: [
        'Use the project only for lawful purposes and in line with these terms.',
        'Do not use it for abuse, harassment, spam, excessive automation, scraping, denial-of-service attempts, credential abuse, malware, phishing or any attempt to circumvent technical limits or security.',
        'Do not import, paste, embed or distribute illegal content or content you have no right to use.',
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
        'Imported documents and uploaded images are processed locally in your browser. Do not import or insert content that is illegal or that you are not allowed to use. When you insert an image by URL, your browser contacts that third-party server directly.',
      ],
    },
    {
      heading: 'Results may be imperfect',
      paragraphs: [
        'Editing, import, conversion and export results can be incomplete, outdated or wrong. Always review important documents before relying on them.',
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        formatMessage(
          'These terms may change as the project evolves. The project is operated from {jurisdiction}; mandatory local consumer law remains unaffected.',
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
  contactPlaceholder: 'Die Kontaktdaten werden vom Betreiber der Seite konfiguriert.',
  contactNameLabel: 'Verantwortlich',
  contactEmailLabel: 'E-Mail',
  contactUrlLabel: 'Kontakt',
  jurisdictionLabel: 'Zuständigkeit',
  blocks: [
    {
      heading: 'Keine Gewährleistung',
      paragraphs: [
        'Dies ist ein kostenloses Hobbyprojekt, das „wie besehen" ohne jede Gewährleistung für Verfügbarkeit, Eignung für einen bestimmten Zweck oder Richtigkeit bereitgestellt wird. Die Nutzung erfolgt auf eigenes Risiko.',
      ],
    },
    {
      heading: 'Zulässige Nutzung',
      bullets: [
        'Nutze das Projekt nur für rechtmäßige Zwecke und im Einklang mit diesen Bedingungen.',
        'Keine missbräuchliche Nutzung, Belästigung, kein Spam, keine übermäßige Automatisierung, kein Scraping, keine Denial-of-Service-Versuche, kein Missbrauch von Zugangsdaten, keine Schadsoftware, kein Phishing und keine Versuche, technische Grenzen oder Sicherheitsmechanismen zu umgehen.',
        'Importiere, füge oder verbreite keine illegalen Inhalte oder Inhalte, zu deren Nutzung du nicht berechtigt bist.',
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
        'Importierte Dokumente und hochgeladene Bilder werden lokal in deinem Browser verarbeitet. Importiere oder füge keine Inhalte ein, die illegal sind oder die du nicht verwenden darfst. Wenn du ein Bild per URL einfügst, kontaktiert dein Browser den Server des Dritten direkt.',
      ],
    },
    {
      heading: 'Ergebnisse können fehlerhaft sein',
      paragraphs: [
        'Bearbeitungs-, Import-, Konvertierungs- und Exportergebnisse können unvollständig, veraltet oder falsch sein. Überprüfe wichtige Dokumente immer, bevor du dich darauf verlässt.',
      ],
    },
    {
      heading: 'Änderungen',
      paragraphs: [
        formatMessage(
          'Diese Bedingungen können sich mit der Weiterentwicklung des Projekts ändern. Das Projekt wird aus {jurisdiction} betrieben; zwingendes lokales Verbraucherrecht bleibt unberührt.',
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
