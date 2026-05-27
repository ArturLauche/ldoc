import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { exportDocument } from './documentExport';
import { extractExportDocumentFromHtml } from './model';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('extractExportDocumentFromHtml', () => {
  it('extracts structured blocks, links, marks, nested lists, tables, images and diagrams', () => {
    const model = extractExportDocumentFromHtml({
      html: `
        <h1>Title</h1>
        <p><strong>Bold</strong> <a href="https://example.com" title="Example">Link</a> <mark>Marked</mark></p>
        <blockquote><p>Quote</p></blockquote>
        <pre><code>const x = 1;
next()</code></pre>
        <ol start="4"><li>First<ul><li>Nested</li></ul></li></ol>
        <table><tr><th colspan="2">Head</th></tr><tr><td rowspan="2">A</td><td>B</td></tr></table>
        <img src="${TINY_PNG}" alt="Dot" data-width="50" data-align="right">
        <div data-smart-diagram="true" data-template="process" data-title="Plan" data-items="A|B"></div>
      `,
      name: 'Fixture',
      locale: 'en',
    });

    expect(model.blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(model.blocks[1]).toMatchObject({
      type: 'paragraph',
      runs: expect.arrayContaining([
        expect.objectContaining({ text: 'Bold', marks: expect.objectContaining({ bold: true }) }),
        expect.objectContaining({ text: 'Link', link: expect.objectContaining({ href: 'https://example.com' }) }),
        expect.objectContaining({ text: 'Marked', marks: expect.objectContaining({ highlight: expect.any(String) }) }),
      ]),
    });
    expect(model.blocks.some((block) => block.type === 'blockquote')).toBe(true);
    expect(model.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'paragraph',
          runs: expect.arrayContaining([
            expect.objectContaining({ text: expect.stringContaining('const x'), marks: expect.objectContaining({ fontFamily: 'Courier New' }) }),
          ]),
        }),
      ]),
    );
    expect(model.blocks.some((block) => block.type === 'list')).toBe(true);
    expect(model.blocks.some((block) => block.type === 'table')).toBe(true);
    expect(model.blocks.some((block) => block.type === 'image')).toBe(true);
    expect(model.blocks.some((block) => block.type === 'smart-diagram')).toBe(true);
  });
});

describe('exportDocument', () => {
  it('exports sanitized plain text with links rendered visibly', async () => {
    const result = await exportDocument({
      html: '<h1>Title</h1><p onclick="alert(1)">See <a href="https://example.com">example</a></p><script>alert(1)</script>',
      name: 'My Report',
      locale: 'en',
      format: 'txt',
    });

    await expect(result.blob.text()).resolves.toBe('Title\nSee example (https://example.com)');
    expect(result.fileName).toBe('My Report.txt');
    expect(result.warnings).toEqual([]);
  });

  it('exports a complete sanitized HTML document', async () => {
    const result = await exportDocument({
      html: '<p>Safe</p><script>alert(1)</script>',
      name: 'Page',
      locale: 'de',
      format: 'html',
    });

    const html = await result.blob.text();
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<p>Safe</p>');
    expect(html).not.toContain('<script>');
    expect(result.fileName).toBe('Page.html');
    expect(result.warnings).toEqual([]);
  });

  it('exports RTF as basic compatibility format with Unicode escapes', async () => {
    const result = await exportDocument({
      html: '<p>Grüße Ω</p><img src="data:image/svg+xml;base64,PHN2Zy8+" alt="Vector">',
      name: 'Unicode',
      locale: 'en',
      format: 'rtf',
    });

    const rtf = await result.blob.text();
    expect(rtf).toContain('\\rtf1');
    expect(rtf).toContain('\\u252?');
    expect(rtf).toContain('\\u937?');
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['rtf-basic-format', 'image-format-unsupported']),
    );
  });

  it('builds DOCX package relationships, media, links, numbering and document XML', async () => {
    const result = await exportDocument({
      html: `<h1>Title</h1><p><a href="https://example.com">Example</a></p><ol start="4"><li>Fourth</li></ol><img src="${TINY_PNG}" alt="Dot" data-width="25">`,
      name: 'Docx',
      locale: 'en',
      format: 'docx',
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml')?.async('string');
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    const numberingXml = await zip.file('word/numbering.xml')?.async('string');
    const contentTypes = await zip.file('[Content_Types].xml')?.async('string');

    expect(documentXml).toContain('<w:hyperlink r:id=');
    expect(documentXml).toContain('<w:drawing>');
    expect(relsXml).toContain('relationships/hyperlink');
    expect(relsXml).toContain('relationships/image');
    expect(numberingXml).toContain('<w:startOverride w:val="4"/>');
    expect(contentTypes).toContain('ContentType="image/png"');
    expect(zip.file('word/media/image1.png')).toBeTruthy();
    expect(result.warnings).toEqual([]);
  });

  it('builds ODT content, manifest entries, media and links', async () => {
    const result = await exportDocument({
      html: `<p><a href="https://example.com">Example</a></p><ol start="4"><li>Fourth</li></ol><img src="${TINY_PNG}" alt="Dot">`,
      name: 'Odt',
      locale: 'en',
      format: 'odt',
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const contentXml = await zip.file('content.xml')?.async('string');
    const manifestXml = await zip.file('META-INF/manifest.xml')?.async('string');

    expect(contentXml).toContain('<text:a xlink:type="simple" xlink:href="https://example.com">');
    expect(contentXml).toContain('text:start-value="4"');
    expect(contentXml).toContain('<draw:image xlink:href="Pictures/image1.png"');
    expect(manifestXml).toContain('manifest:full-path="Pictures/image1.png"');
    expect(zip.file('Pictures/image1.png')).toBeTruthy();
    expect(result.warnings).toEqual([]);
  });

  it('exports parseable PDF blobs and reports font fallback when bundled fonts are unavailable in tests', async () => {
    const result = await exportDocument({
      html: `<h1>Title</h1><p>Body with a <a href="https://example.com">link</a>.</p><table><tr><td>A</td><td>B</td></tr></table><img src="${TINY_PNG}" alt="Dot">`,
      name: 'Pdf',
      locale: 'en',
      format: 'pdf',
    });

    const loaded = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(loaded.getPageCount()).toBeGreaterThan(0);
    expect(result.fileName).toBe('Pdf.pdf');
    expect(result.warnings.map((warning) => warning.code)).toContain('table-layout-simplified');
  });

  it('draws PDF headings and table cells with their layout base font sizes', async () => {
    const drawTextSpy = vi.spyOn(PDFPage.prototype, 'drawText');

    try {
      await exportDocument({
        html: '<h1>Large Heading</h1><table><tr><td>Table Cell</td></tr></table>',
        name: 'Pdf Sizes',
        locale: 'en',
        format: 'pdf',
      });

      expect(drawTextSpy.mock.calls).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['Large']),
          expect.arrayContaining(['Table']),
        ]),
      );
      expect(drawTextSpy.mock.calls.find(([text]) => text === 'Large')?.[1]).toMatchObject({ size: 22 });
      expect(drawTextSpy.mock.calls.find(([text]) => text === 'Table')?.[1]).toMatchObject({ size: 10 });
    } finally {
      drawTextSpy.mockRestore();
    }
  });
});
