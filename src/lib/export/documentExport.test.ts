import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString } from 'pdf-lib';
import { createStarterGraphic, demoteGraphicItem, serializeSmartGraphic, updateGraphicTitle } from '@/lib/smartGraphic';
import { serveExportAssets } from '@/test/exportAssets';
import { exportDocument } from './documentExport';
import { loadFontkit } from './fonts/fontkit';
import { obfuscateFont } from './fonts/embedding';
import { extractExportDocumentFromHtml } from './model';
import type { ExportFormat } from './types';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => {
  assets = serveExportAssets();
});
afterEach(() => assets.restore());

function exportAs(format: ExportFormat, html: string, name = 'Doc', locale: 'en' | 'de' = 'en') {
  return exportDocument({ html, name, locale, format });
}

async function unzip(blob: Blob) {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

function expectWellFormedXml(xml: string | undefined) {
  expect(xml).toBeTruthy();
  const parsed = new DOMParser().parseFromString(xml as string, 'application/xml');
  expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
}

describe('extractExportDocumentFromHtml', () => {
  it('extracts structured blocks, links, marks, nested lists, tables and images', () => {
    const model = extractExportDocumentFromHtml({
      html: `
        <h1>Title</h1>
        <p><strong>Bold</strong> <a href="https://example.com" title="Example">Link</a> <mark>Marked</mark></p>
        <blockquote><p>Quote</p><ul><li>Inside</li></ul></blockquote>
        <pre><code>const x = 1;
next()</code></pre>
        <ol start="4"><li>First<ul><li>Nested</li></ul></li></ol>
        <table><colgroup><col style="width: 120px"><col></colgroup><tr><th colspan="2">Head</th></tr><tr><td rowspan="2" data-background-color="#1e40af" style="background-color: #1e40af; color: #f8fafc">A</td><td>B</td></tr></table>
        <img src="${TINY_PNG}" alt="Dot" data-width="50" data-align="right">
        <div data-lwrite-graphic='${serializeSmartGraphic(updateGraphicTitle(createStarterGraphic('process-chevron'), 'Plan'))}'></div>
      `,
      name: 'Fixture',
      locale: 'en',
    });
    const [heading, paragraph, quote, code, list, table, image, graphic] = model.blocks;

    expect(heading).toMatchObject({ type: 'heading', level: 1 });
    expect(paragraph).toMatchObject({
      type: 'paragraph',
      runs: expect.arrayContaining([
        expect.objectContaining({ text: 'Bold', marks: expect.objectContaining({ bold: true }) }),
        expect.objectContaining({ text: 'Link', link: expect.objectContaining({ href: 'https://example.com' }) }),
        // A plain <mark> renders with the browser's default yellow.
        expect.objectContaining({ text: 'Marked', marks: expect.objectContaining({ highlight: '#FFFF00' }) }),
      ]),
    });
    expect(quote).toMatchObject({
      type: 'blockquote',
      blocks: [expect.objectContaining({ type: 'paragraph' }), expect.objectContaining({ type: 'list' })],
    });
    expect(code).toEqual({ type: 'code-block', text: 'const x = 1;\nnext()' });
    expect(list).toMatchObject({
      type: 'list',
      ordered: true,
      start: 4,
      items: [{ blocks: [expect.objectContaining({ type: 'paragraph' }), expect.objectContaining({ type: 'list', ordered: false })] }],
    });
    expect(table).toMatchObject({
      type: 'table',
      columnWidths: [120, null],
      rows: [
        { cells: [expect.objectContaining({ header: true, colSpan: 2 })] },
        { cells: [expect.objectContaining({ rowSpan: 2, backgroundColor: '#1e40af', color: 'rgb(248, 250, 252)' }), expect.anything()] },
      ],
    });
    expect(image).toMatchObject({ type: 'image', alt: 'Dot', widthPercent: 50, align: 'right', float: 'right' });
    expect(graphic).toMatchObject({ type: 'graphic', layoutId: 'process-chevron', title: 'Plan', model: expect.objectContaining({ title: 'Plan' }) });
  });

  const runsOf = (html: string) => {
    const [block] = extractExportDocumentFromHtml({ html, name: 'Doc', locale: 'en' }).blocks;
    return block.type === 'paragraph' ? block.runs : [];
  };

  it('keeps every link the editor accepts, including fragments and relative paths', () => {
    const hrefs = ['#section', '/privacy', './notes.txt', '../shared/plan.odt', 'https://example.com/', 'mailto:a@example.com'];
    const runs = runsOf(`<p>${hrefs.map((href) => `<a href="${href}">${href}</a> `).join('')}<a href="javascript:alert(1)">x</a></p>`);
    expect(runs.filter((run) => run.link).map((run) => run.link?.href)).toEqual(hrefs);
  });

  it('passes styles of table cells and other containers on to their text', () => {
    const [table] = extractExportDocumentFromHtml({
      html: '<table><tr><td style="color: red; font-family: Inter; font-size: 20px"><p>Styled</p></td><td data-background-color="#1e40af" style="background-color: #1e40af; color: #f8fafc"><p>Filled</p></td></tr></table><ul style="font-style: italic"><li><p>Item</p></li></ul>',
      name: 'Doc',
      locale: 'en',
    }).blocks;
    if (table.type !== 'table') throw new Error('expected a table');
    const [styled, filled] = table.rows[0].cells;
    const cellRun = (cell: typeof styled) => (cell.blocks[0].type === 'paragraph' ? cell.blocks[0].runs[0] : undefined);
    expect(cellRun(styled)?.marks).toEqual({ color: 'red', fontFamily: 'Inter', fontSize: '20px' });
    // A filled cell's contrast ink stays the cell color, and its fill is no text highlight.
    expect(cellRun(filled)?.marks).toEqual({});
    expect(filled.color).toBe('rgb(248, 250, 252)');
  });

  it('keeps line breaks of code blocks and private-use characters in text', () => {
    const blocks = extractExportDocumentFromHtml({ html: '<pre><code>one<br>two</code></pre><p>Icon \uE000 here</p>', name: 'Doc', locale: 'en' }).blocks;
    expect(blocks[0]).toEqual({ type: 'code-block', text: 'one\ntwo' });
    expect(blocks[1]).toMatchObject({ runs: [{ text: 'Icon \uE000 here' }] });
  });
});

describe('links in editable formats', () => {
  const LINKS = '<p><a href="https://example.com/">Web</a> <a href="./notes.txt">Sibling</a> <a href="../up/plan.odt">Parent</a> <a href="/root">Root</a> <a href="#details">Fragment</a> <a href="#top">Top</a></p>';
  // LWrite documents carry no element ids, so `#details` has no target in any format.
  const deadFragment = [expect.objectContaining({ code: 'link-not-supported-by-format', detail: '#details' })];

  it('DOCX: relative paths as relationships, #top to a bookmark at the start', async () => {
    const result = await exportAs('docx', LINKS);
    const zip = await unzip(result.blob);
    const rels = (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '';
    ['https://example.com/', './notes.txt', '../up/plan.odt', '/root'].forEach((target) =>
      expect(rels).toContain(`Target="${target}" TargetMode="External"`),
    );
    const document = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(document).toContain('<w:hyperlink w:anchor="top"');
    expect(document).toMatch(/<w:body><w:p><w:pPr>.*?<\/w:pPr><w:bookmarkStart w:id="0" w:name="top"\/><w:bookmarkEnd w:id="0"\/>/);
    // The dead fragment keeps the link's look as plain text.
    expect(document.match(/<w:hyperlink /g)).toHaveLength(5);
    expect(document).toMatch(/<w:r><w:rPr>[^]*?<w:u w:val="single"\/>[^]*?<\/w:rPr><w:t xml:space="preserve">Fragment<\/w:t><\/w:r>/);
    expect(result.warnings).toEqual(deadFragment);
  });

  it('ODT: paths relative to the file climb out of the package; #top has a bookmark', async () => {
    const result = await exportAs('odt', LINKS);
    const content = (await (await unzip(result.blob)).file('content.xml')?.async('string')) ?? '';
    const hrefs = Array.from(content.matchAll(/<text:a [^>]*xlink:href="([^"]+)"/g), (match) => match[1]);
    expect(hrefs).toEqual(['https://example.com/', '../notes.txt', '../../up/plan.odt', '/root', '#top']);
    expect(content).toContain('<text:bookmark text:name="top"/>');
    expect(result.warnings).toEqual(deadFragment);
  });

  it('RTF: hyperlink fields for paths, #top to a bookmark at the start', async () => {
    const result = await exportAs('rtf', LINKS);
    const rtf = await result.blob.text();
    ['https://example.com/', './notes.txt', '../up/plan.odt', '/root'].forEach((target) => expect(rtf).toContain(`HYPERLINK "${target}"`));
    expect(rtf).toContain('HYPERLINK \\\\l "top"');
    expect(rtf).toContain('{\\*\\bkmkstart top}{\\*\\bkmkend top}\\pard');
    expect(rtf).not.toContain('details');
    expect(result.warnings).toEqual([...deadFragment, expect.objectContaining({ code: 'font-not-embedded' })]);
  });

  it('PDF: URI actions for paths, the start for #top, and a warning for other fragments', async () => {
    const result = await exportAs('pdf', LINKS);
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer(), { updateMetadata: false });
    const actions = (pdf.getPage(0).node.Annots()?.asArray() ?? []).map((ref) => pdf.context.lookup(ref, PDFDict).lookup(PDFName.of('A'), PDFDict));
    const uris = actions.map((action) => {
      const uri = action.get(PDFName.of('URI'));
      return uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : action.get(PDFName.of('S'))?.toString();
    });
    expect(uris).toEqual(['https://example.com/', './notes.txt', '../up/plan.odt', '/root', '/GoTo']);
    expect(result.warnings).toEqual(deadFragment);
  });
});


describe('TXT export', () => {
  it('keeps structure readable: headings, blank lines and link addresses', async () => {
    const result = await exportAs(
      'txt',
      '<h1>Title</h1><p onclick="alert(1)">See <a href="https://example.com">example</a></p><script>alert(1)</script>',
      'My Report',
    );
    await expect(result.blob.text()).resolves.toBe('Title\n=====\n\nSee example (https://example.com)');
    expect(result.fileName).toBe('My Report.txt');
    expect(result.blob.type).toBe('text/plain');
    expect(result.warnings).toEqual([]);
  });

  it('aligns table columns, separates header rows and spans merged cells', async () => {
    const plain = await exportAs('txt', '<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apples</td><td>3</td></tr></table>', 'Inventory');
    await expect(plain.blob.text()).resolves.toBe('Name   | Qty\n-------+----\nApples | 3');

    const merged = await exportAs('txt', '<table><tr><td colspan="2">Wide heading text</td></tr><tr><td>A</td><td>B</td></tr></table>');
    await expect(merged.blob.text()).resolves.toBe('Wide heading text\nA | B');
  });

  it('indents lists, quotes and code', async () => {
    const result = await exportAs(
      'txt',
      '<ol start="3"><li><p>Three</p><ul><li>Inner</li></ul></li></ol><blockquote><p>Quoted</p><p>Again</p></blockquote><pre><code>if (a) {\n\treturn;\n}</code></pre><hr>',
    );
    await expect(result.blob.text()).resolves.toBe(
      ['3. Three', '   - Inner', '', '> Quoted', '>', '> Again', '', '    if (a) {', '        return;', '    }', '', '-'.repeat(40)].join('\n'),
    );
    const nested = await exportAs('txt', '<ul><li><p>A</p><ul><li><p>B</p><ol><li><p>C</p><p>C2</p></li></ol></li></ul></li><li><p>D</p></li></ul>');
    await expect(nested.blob.text()).resolves.toBe(['- A', '  - B', '    1. C', '', '       C2', '- D'].join('\n'));
  });

  it('exports leftover smart diagrams as readable text', async () => {
    const result = await exportAs('txt', '<div data-smart-diagram="true" data-template="process" data-title="Plan" data-items="A|B"></div>', 'Plan');
    await expect(result.blob.text()).resolves.toBe('Plan: A -> B');
    expect(result.warnings).toEqual([]);
  });
});

describe('HTML export', () => {
  it('writes a complete, sanitized, self-contained document', async () => {
    const result = await exportAs('html', '<p>Safe <strong>bold</strong></p><script>alert(1)</script>', 'Page', 'de');
    const html = await result.blob.text();
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<p>Safe <strong>bold</strong></p>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Content-Security-Policy');
    expect(result.fileName).toBe('Page.html');
    expect(result.blob.type).toBe('text/html');
    expect(result.warnings).toEqual([]);
  });

  it('embeds only the font files the text needs, as data URLs', async () => {
    const result = await exportAs('html', '<p>Plain <strong>latin</strong> text</p><p><span style="font-family: Inter">Zażółć</span></p>');
    const html = await result.blob.text();
    // DM Sans (body) latin subset, Inter latin and latin-ext (for ż, ł, ć).
    const rules = html.match(/@font-face\{[^}]*\}/g) ?? [];
    const families = rules.map((rule) => rule.match(/font-family:'([^']+)'/)?.[1]);
    expect(families.filter((family) => family === 'DM Sans')).toHaveLength(1);
    expect(families.filter((family) => family === 'Inter')).toHaveLength(2);
    rules.forEach((rule) => expect(rule).toContain('src:url(data:font/woff2;base64,'));
    // Weights that share one variable font file are one rule with a range.
    expect(rules.find((rule) => rule.includes("'DM Sans'"))).toMatch(/font-weight:\d+ \d+/);
    // Nothing is loaded from elsewhere when the file is opened.
    expect(html).not.toMatch(/url\((?!data:)/);
    expect(html).not.toContain('/fonts/');
    expect(assets.requests.filter((url) => url.includes('cyrillic'))).toEqual([]);
    // Each embedded family carries its license with the copyright notice.
    expect(html).toMatch(/\/\*! DM Sans\n\nCopyright 2014 The DM Sans Project Authors[^]*SIL Open Font License[^]*\*\/\n@font-face\{font-family:'DM Sans'/);
    expect(html).toMatch(/\/\*! Inter\n\nCopyright 2020 The Inter Project Authors/);
  });

  it('mirrors the editor document styles', async () => {
    const html = await (await exportAs('html', '<h2>Section</h2><p>Text</p>')).blob.text();
    expect(html).toContain('white-space:break-spaces');
    expect(html).toContain('font-variant-ligatures:none');
    expect(html).toMatch(/h2\{font-size:28px;font-weight:600;line-height:1\.3/);
    expect(html).toContain('.lwrite-document>ul>li p{margin-top:0.75em}');
  });

  it('embeds data images and links remote images it cannot download instead of loading them', async () => {
    const result = await exportAs('html', `<img src="${TINY_PNG}" alt="Dot"><img src="https://images.example/remote.png" alt="Remote">`);
    const html = await result.blob.text();
    expect(html).toContain(`src="${TINY_PNG}"`);
    expect(html).not.toContain('src="https://images.example');
    expect(html).toContain('<p><a href="https://images.example/remote.png" rel="noopener noreferrer">[Image: Remote]</a></p>');
    expect(html).toContain("img-src data:;");
    expect(result.warnings.map((warning) => warning.code)).toEqual(['image-not-embedded']);
  });

  it('keeps Smart Graphics editable after re-import', async () => {
    const graphic = updateGraphicTitle(createStarterGraphic('process-chevron'), 'Launch');
    const source = `<div data-lwrite-graphic='${serializeSmartGraphic(graphic)}'></div>`;
    const result = await exportAs('html', source, 'Graphic');
    const html = await result.blob.text();
    expect(html).toContain('data-lwrite-graphic');
    // Without a browser renderer (jsdom) the stored outline is the fallback.
    expect(html).toContain('<ul>');
    expect(result.warnings.map((warning) => warning.code)).toEqual(['graphic-layout-simplified']);

    const body = new DOMParser().parseFromString(html, 'text/html').querySelector('main')?.innerHTML ?? '';
    const reimported = extractExportDocumentFromHtml({ html: body, name: 'Graphic', locale: 'en' });
    expect(reimported.blocks[0]).toMatchObject({ type: 'graphic', title: 'Launch', model: graphic });
  });

  it('escapes document-level HTML attributes as well as document content', async () => {
    const result = await exportDocument({
      html: '<p>Safe</p>',
      name: '<script>bad</script>',
      locale: 'en" onclick="bad()' as 'en',
      format: 'html',
    });
    const doc = new DOMParser().parseFromString(await result.blob.text(), 'text/html');
    expect(doc.documentElement.hasAttribute('onclick')).toBe(false);
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.title).toBe('<script>bad</script>');
  });
});

describe('RTF export', () => {
  it('writes fonts, colors, Unicode, headings, links and page size', async () => {
    const result = await exportAs(
      'rtf',
      '<h1>Grüße</h1><p>Ω <span style="color: #b91c1c">red</span> <mark data-color="#bbf7d0" style="background-color: #bbf7d0">mark</mark> <a href="https://example.com/?q=1">link</a> 🚀</p>',
      'Unicode',
    );
    const rtf = await result.blob.text();
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true);
    expect(rtf).toContain('{\\f0\\fswiss\\fcharset0\\fprq2 DM Sans;}');
    expect(rtf).toContain('\\red185\\green28\\blue28;');
    expect(rtf).toContain('Gr\\u252?\\u223?e');
    expect(rtf).toContain('\\u937?');
    // Characters outside the BMP are written as UTF-16 surrogate pairs.
    expect(rtf).toContain('\\u-10179?\\u-8576?');
    expect(rtf).toMatch(/\\s1\\outlinelevel0\\keepn/);
    expect(rtf).toMatch(/\\chshdng0\\chcbpat\d+ mark/);
    expect(rtf).toContain('{\\field{\\*\\fldinst{HYPERLINK "https://example.com/?q=1"}}');
    expect(rtf).toContain('\\paperw12240\\paperh15840');
    expect(result.blob.type).toBe('application/rtf');
    expect(result.warnings.map((warning) => warning.code)).toEqual(['font-not-embedded']);

    const a4 = await (await exportAs('rtf', '<p>A4</p>', 'A4', 'de')).blob.text();
    expect(a4).toContain('\\paperw11906\\paperh16838');
    expect(a4).toContain('\\deflang1031');
  });

  it('writes native tables with merged cells, fills and header rows', async () => {
    const result = await exportAs(
      'rtf',
      '<table><tr><th colspan="2">Head</th></tr><tr><td rowspan="2" data-background-color="#fef08a" style="background-color: #fef08a">A</td><td>B</td></tr><tr><td>C</td></tr></table>',
    );
    const rtf = await result.blob.text();
    expect(rtf.match(/\\trowd/g)).toHaveLength(3);
    expect(rtf.match(/\\row\b/g)).toHaveLength(3);
    expect(rtf).toContain('\\trhdr');
    expect(rtf).toContain('\\clvmgf');
    expect(rtf).toContain('\\clvmrg');
    expect(rtf).toContain('\\red254\\green240\\blue138;');
    expect(rtf).toMatch(/\\intbl[^]*?A\}\\cell/);
    expect(result.warnings.map((warning) => warning.code)).not.toContain('table-layout-simplified');
  });

  it('writes list numbering and embedded pictures', async () => {
    const result = await exportAs(
      'rtf',
      `<ol start="4"><li>Fourth<ul><li>Bullet</li></ul></li></ol><img src="${TINY_PNG}" alt="Dot" data-width="25"><img src="${TINY_PNG}" alt="Side" data-align="left"><p>Wraps</p>`,
    );
    const rtf = await result.blob.text();
    expect(rtf).toContain('{\\*\\listtable');
    expect(rtf).toContain('\\levelstartat4');
    expect(rtf).toMatch(/\\ls1\\ilvl0/);
    expect(rtf).toMatch(/\\ls2\\ilvl1/);
    expect(rtf).toContain('\\pngblip\\picw1\\pich1');
    expect(rtf).toContain('{\\sp{\\sn wzDescription}{\\sv Dot}}');
    // Floating images are positioned frames that the next paragraph wraps around.
    expect(rtf).toMatch(/\\phmrg\\posx\d+\\pvpara\\posy\d+\\absw\d+/);
  });
});

describe('DOCX export', () => {
  it('builds package relationships, media, links, numbering and well-formed parts', async () => {
    const result = await exportAs(
      'docx',
      `<h1>Title</h1><p><a href="https://example.com">Example</a></p><ol start="4"><li>Fourth</li></ol><img src="${TINY_PNG}" alt="Dot" data-width="25">`,
      'Docx',
    );
    const zip = await unzip(result.blob);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    const numberingXml = await zip.file('word/numbering.xml')?.async('string');
    const contentTypes = await zip.file('[Content_Types].xml')?.async('string');

    expect(documentXml).toContain('<w:hyperlink r:id=');
    expect(documentXml).toContain('<w:drawing>');
    expect(documentXml).toContain('descr="Dot"');
    expect(documentXml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(relsXml).toContain('relationships/hyperlink');
    expect(relsXml).toContain('relationships/image');
    expect(numberingXml).toContain('<w:startOverride w:val="4"/>');
    expect(contentTypes).toContain('ContentType="image/png"');
    expect(zip.file('word/media/image1.png')).toBeTruthy();
    for (const path of Object.keys(zip.files).filter((name) => name.endsWith('.xml') || name.endsWith('.rels'))) {
      expectWellFormedXml(await zip.file(path)?.async('string'));
    }
    expect(result.warnings).toEqual([]);
  });

  it('embeds the document fonts as obfuscated static instances', async () => {
    const result = await exportAs('docx', '<p>Regular <strong>bold</strong> <span style="font-family: Lora">serif</span></p>');
    const zip = await unzip(result.blob);
    const fontTable = (await zip.file('word/fontTable.xml')?.async('string')) ?? '';
    const fontRels = (await zip.file('word/_rels/fontTable.xml.rels')?.async('string')) ?? '';
    const settings = await zip.file('word/settings.xml')?.async('string');
    expect(settings).toContain('<w:embedTrueTypeFonts/>');
    expect(fontTable).toMatch(/<w:font w:name="DM Sans">.*<w:embedRegular r:id="rId\d+" w:fontKey="\{[0-9A-F-]+\}"\/><w:embedBold/);
    expect(fontTable).toContain('<w:font w:name="Lora">');

    // De-obfuscating with the key yields a TrueType font with the used characters.
    const [, relationshipId, key] = fontTable.match(/<w:font w:name="DM Sans">.*?<w:embedRegular r:id="(rId\d+)" w:fontKey="(\{[^"]+\})"/) ?? [];
    const target = fontRels.match(new RegExp(`Id="${relationshipId}"[^>]*Target="([^"]+)"`))?.[1];
    const obfuscated = await zip.file(`word/${target}`)?.async('uint8array');
    expect(obfuscated).toBeTruthy();
    const bytes = obfuscateFont(obfuscated as Uint8Array, key);
    const fontkit = await loadFontkit();
    const font = fontkit.create(bytes);
    expect(font.familyName).toBe('DM Sans');
    expect(font.hasGlyphForCodePoint('R'.codePointAt(0) as number)).toBe(true);
  });

  it('writes merged cells, cell colors, alignment and hidden borders', async () => {
    const result = await exportAs(
      'docx',
      `<table data-borders="hidden"><tr><td rowspan="2" style="text-align: center">A</td><td data-background-color="#1e40af" style="background-color: #1e40af; color: #f8fafc">B</td></tr><tr><td>C</td></tr></table>`,
    );
    const documentXml = (await (await unzip(result.blob)).file('word/document.xml')?.async('string')) ?? '';
    expect(documentXml).toContain('w:val="restart"');
    expect(documentXml).toContain('<w:vMerge/>');
    expect(documentXml).toContain('<w:jc w:val="center"/>');
    expect(documentXml).toContain('w:val="nil"');
    expect(documentXml).toContain('w:fill="1E40AF"');
    // Text on a filled cell keeps the contrasting color the editor shows.
    expect(documentXml).toMatch(/<w:color w:val="F8FAFC"\/>.*B<\/w:t>/);
  });

  it('keeps the body schema-valid around floats and orders run properties', async () => {
    const result = await exportAs(
      'docx',
      `<img src="${TINY_PNG}" alt="Dot" data-align="left" data-width="10"><table><tr><td><p>Cell</p></td></tr></table><img src="${TINY_PNG}" alt="Dot" data-align="right" data-width="10"><div data-lwrite-graphic='${serializeSmartGraphic(createStarterGraphic('process-chevron'))}'></div><p><u><mark style="background-color: #fef08a">Marked</mark></u></p>`,
    );
    const documentXml = (await (await unzip(result.blob)).file('word/document.xml')?.async('string')) ?? '';
    expectWellFormedXml(documentXml);
    const body = new DOMParser().parseFromString(documentXml, 'application/xml').getElementsByTagName('w:body')[0];
    // CT_Body holds paragraphs and tables; floated pictures sit in runs inside paragraphs.
    expect(Array.from(body.children, (child) => child.tagName).filter((tag) => !['w:p', 'w:tbl', 'w:sectPr'].includes(tag))).toEqual([]);
    expect(documentXml).toMatch(/<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"\/><\/w:pPr><w:r><w:drawing><wp:anchor[^]*?<\/w:p><w:tbl>/);
    expect(documentXml).toContain('<w:rPr><w:u w:val="single"/><w:shd w:val="clear" w:color="auto" w:fill="FEF08A"/></w:rPr>');
  });

  it('uses the editor line boxes as at-least line spacing', async () => {
    const zip = await unzip((await exportAs('docx', '<p>Body <span style="font-size: 24px">large</span></p>')).blob);
    const styles = await zip.file('word/styles.xml')?.async('string');
    const documentXml = await zip.file('word/document.xml')?.async('string');
    // 16px × 1.75 = 28px = 420 twips.
    expect(styles).toContain('w:line="420" w:lineRule="atLeast"');
    // A 24px span makes a 42px line box.
    expect(documentXml).toContain('w:line="630" w:lineRule="atLeast"');
  });

  it('falls back to outlines for Smart Graphics it cannot draw', async () => {
    const timeline = updateGraphicTitle(createStarterGraphic('timeline-vertical'), 'Roadmap');
    const result = await exportAs('docx', `<div data-lwrite-graphic='${serializeSmartGraphic(timeline)}'></div>`);
    expect(result.warnings.map((warning) => warning.code)).toContain('graphic-layout-simplified');
    const documentXml = await (await unzip(result.blob)).file('word/document.xml')?.async('string');
    expect(documentXml).toContain('Roadmap');
    expect(documentXml).toContain('Milestone 1');
  });
});

describe('ODT export', () => {
  it('builds content, styles, manifest, media and links', async () => {
    const result = await exportAs(
      'odt',
      `<h2>Heading</h2><p><a href="https://example.com">Example</a></p><ol start="4"><li>Fourth</li></ol><img src="${TINY_PNG}" alt="Dot">`,
      'Odt',
    );
    const zip = await unzip(result.blob);
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    const contentXml = (await zip.file('content.xml')?.async('string')) ?? '';
    const manifestXml = await zip.file('META-INF/manifest.xml')?.async('string');
    const stylesXml = (await zip.file('styles.xml')?.async('string')) ?? '';

    expect(contentXml).toContain('<text:h text:style-name="P1" text:outline-level="2">');
    expect(contentXml).toContain('<text:a xlink:type="simple" xlink:href="https://example.com"');
    expect(contentXml).toContain('<text:list-item text:start-value="4">');
    expect(contentXml).toContain('<draw:image xlink:href="Pictures/image1.png"');
    expect(contentXml).toContain('<svg:title>Dot</svg:title>');
    expect(stylesXml).toContain('style:name="Heading_20_2"');
    expect(stylesXml).toContain('fo:page-width="612pt"');
    expect(manifestXml).toContain('manifest:full-path="Pictures/image1.png"');
    for (const path of ['content.xml', 'styles.xml', 'meta.xml', 'settings.xml', 'META-INF/manifest.xml']) {
      expectWellFormedXml(await zip.file(path)?.async('string'));
    }
    expect(result.warnings).toEqual([]);
  });

  it('embeds every font weight the text uses', async () => {
    const zip = await unzip((await exportAs('odt', '<p>Regular <strong>semi</strong></p><h1>Bold heading</h1>')).blob);
    const manifest = (await zip.file('META-INF/manifest.xml')?.async('string')) ?? '';
    const stylesXml = (await zip.file('styles.xml')?.async('string')) ?? '';
    const fonts = Object.keys(zip.files).filter((name) => name.startsWith('Fonts/') && !zip.files[name].dir);
    // DM Sans 400 (text), 600 (strong) and 700 (h1).
    expect(fonts).toHaveLength(3);
    expect(fonts.some((name) => name.includes('SemiBold'))).toBe(true);
    fonts.forEach((name) => expect(manifest).toContain(`manifest:full-path="${name}" manifest:media-type="application/x-font-ttf"`));
    expect(stylesXml).toContain('<svg:font-face-uri xlink:href="Fonts/');
    const contentXml = (await zip.file('content.xml')?.async('string')) ?? '';
    expect(contentXml).toContain('fo:font-weight="600"');
  });

  it('names the medium face, which LibreOffice cannot select by weight', async () => {
    const zip = await unzip((await exportAs('odt', '<p>Text with a <a href="https://example.com/">link</a></p>')).blob);
    const contentXml = (await zip.file('content.xml')?.async('string')) ?? '';
    expect(contentXml).toMatch(/<style:font-face style:name="DM Sans Medium" svg:font-family="'DM Sans Medium'"[^>]*><svg:font-face-src><svg:font-face-uri xlink:href="Fonts\/DMSansMedium-Regular-\d\.ttf"/);
    // Link text (weight 500) uses that face at normal weight.
    expect(contentXml).toMatch(/style:font-name="DM Sans Medium"[^>]*fo:font-weight="normal"/);
    expect(contentXml).not.toContain('fo:font-weight="500"');
  });

  it('writes alignment of nested paragraphs, merged and filled cells', async () => {
    const result = await exportAs(
      'odt',
      `<ul><li><p style="text-align: right">Nested right</p></li></ul>
       <table><tr><td colspan="2" data-background-color="#FEF08A">Filled</td></tr><tr><td><h2 style="text-align: center">Nested center</h2></td><td>B</td></tr></table>`,
    );
    const contentXml = (await (await unzip(result.blob)).file('content.xml')?.async('string')) ?? '';
    expect(contentXml).toContain('fo:text-align="end"');
    expect(contentXml).toContain('fo:text-align="center"');
    expect(contentXml).toContain('table:number-columns-spanned="2"');
    expect(contentXml).toContain('<table:covered-table-cell/>');
    expect(contentXml).toContain('fo:background-color="#FEF08A"');
  });
});

describe('PDF export', () => {
  async function loadPdf(html: string, locale: 'en' | 'de' = 'en') {
    const result = await exportAs('pdf', html, 'Pdf', locale);
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer(), { updateMetadata: false });
    return { result, pdf };
  }

  function fontNames(pdf: PDFDocument): string[] {
    return pdf.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFDict => object instanceof PDFDict && object.get(PDFName.of('Type')) === PDFName.of('Font'))
      .map((dict) => dict.get(PDFName.of('BaseFont'))?.toString() ?? '');
  }

  it('embeds the document fonts as subsets and sizes pages by locale', async () => {
    const { result, pdf } = await loadPdf('<h1>Title</h1><p>Body <strong>bold</strong> <span style="font-family: Arial">Arial</span></p>');
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const names = fontNames(pdf);
    expect(names.some((name) => /^\/[A-Z]{6}\+DMSans-700$/.test(name))).toBe(true);
    expect(names.some((name) => /^\/[A-Z]{6}\+DMSans-600$/.test(name))).toBe(true);
    expect(names).toContain('/Helvetica');
    expect(result.fileName).toBe('Pdf.pdf');
    // Arial is drawn with its metric-compatible standard font, so nothing to report.
    expect(result.warnings).toEqual([]);

    const a4 = await loadPdf('<p>A4</p>', 'de');
    expect(a4.pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });

  it('adds clickable links, an outline and metadata', async () => {
    const { pdf } = await loadPdf('<h1>Intro</h1><p>Read <a href="https://example.com/docs">the docs</a>.</p><h2>Details</h2><p>More</p>');
    const annotations = pdf.getPage(0).node.Annots();
    expect(annotations?.size()).toBe(1);
    const link = annotations?.lookup(0, PDFDict);
    const action = link?.lookup(PDFName.of('A'), PDFDict);
    const uri = action?.get(PDFName.of('URI'));
    expect(uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : '').toBe('https://example.com/docs');
    const outlines = pdf.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines.get(PDFName.of('Count'))?.toString()).toBe('2');
    expect(pdf.getTitle()).toBe('Pdf');
    expect(pdf.getProducer()).toContain('LWrite');
  });

  it('maps glyphs back to text for search and copy', async () => {
    const { pdf } = await loadPdf('<p>Searchable</p>');
    const toUnicode = pdf.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .find((object) => object instanceof PDFDict && object.get(PDFName.of('Subtype')) === PDFName.of('Type0'));
    expect(toUnicode).toBeInstanceOf(PDFDict);
    const stream = (toUnicode as PDFDict).lookup(PDFName.of('ToUnicode'));
    expect(stream).toBeInstanceOf(PDFRawStream);
  });

  it('keeps merged tables and images without simplifying them', async () => {
    const { result, pdf } = await loadPdf(
      `<table><tr><th colspan="2">Head</th></tr><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table><img src="${TINY_PNG}" alt="Dot">`,
    );
    expect(result.warnings.map((warning) => warning.code)).not.toContain('table-layout-simplified');
    const resources = pdf.getPage(0).node.Resources();
    const xObjects = resources?.lookup(PDFName.of('XObject'), PDFDict);
    expect(xObjects?.keys().length).toBe(1);
  });

  it('reports substituted system fonts', async () => {
    const { result } = await loadPdf('<p><span style="font-family: Georgia">Serif</span></p>');
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'font-substituted', detail: 'Georgia' })]);
  });

  it('paginates long documents', async () => {
    const paragraphs = Array.from({ length: 80 }, (_, index) => `<p>Paragraph ${index + 1} with enough words to take a line.</p>`).join('');
    const { pdf } = await loadPdf(paragraphs);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    const outlines = pdf.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
    expect(outlines).toBeUndefined();
    expect(pdf.getPage(1).node.Contents()).toBeTruthy();
    expect(PDFArray).toBeDefined();
  });
});

describe('Smart Graphic outlines', () => {
  it('exports timelines as numbered outlines and card grids with nested bullets', async () => {
    const timeline = updateGraphicTitle(createStarterGraphic('timeline-vertical'), 'Roadmap');
    const timelineText = await (await exportAs('txt', `<div data-lwrite-graphic='${serializeSmartGraphic(timeline)}'></div>`)).blob.text();
    expect(timelineText).toMatch(/1\.\s+Milestone 1/);
    expect(timelineText).toMatch(/4\.\s+Milestone 4/);

    // Details under a milestone stay bullets, as the diagram draws them.
    const detailed = demoteGraphicItem(timeline, timeline.items[1].id);
    const detailedText = await (await exportAs('txt', `<div data-lwrite-graphic='${serializeSmartGraphic(detailed)}'></div>`)).blob.text();
    expect(detailedText).toMatch(/1\.\s+Milestone 1/);
    expect(detailedText).toContain('Milestone 2');
    expect(detailedText).not.toMatch(/\d\.\s+Milestone 2/);
    expect(detailedText).toMatch(/2\.\s+Milestone 3/);

    const cards = createStarterGraphic('list-cards');
    const cardText = await (await exportAs('txt', `<div data-lwrite-graphic='${serializeSmartGraphic(cards)}'></div>`)).blob.text();
    expect(cardText).not.toMatch(/1\.\s+Topic 1/);
    expect(cardText.indexOf('Text 1')).toBeGreaterThan(cardText.indexOf('Topic 1'));
    expect(cardText.indexOf('Text 1')).toBeLessThan(cardText.indexOf('Topic 2'));
  });
});

describe('exportDocument', () => {
  it('rejects unsupported export formats', async () => {
    await expect(
      exportDocument({
        html: '<p>Hi</p>',
        name: 'Doc',
        locale: 'en',
        // @ts-expect-error deliberately invalid format
        format: 'exe',
      }),
    ).rejects.toThrow('Unsupported export format.');
  });

  it('rejects documents that exceed the export size limit', async () => {
    await expect(exportAs('txt', `<p>${'a'.repeat(5_000_001)}</p>`)).rejects.toThrow('too large');
  });

  it('reports fonts it cannot load and still exports', async () => {
    assets.restore();
    const result = await exportAs('pdf', '<p>Offline</p>');
    expect(result.warnings.map((warning) => warning.code)).toContain('font-unavailable');
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
  });
});
