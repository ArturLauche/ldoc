import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { importDocument } from './DocumentImporter';

function textFile(content: string, name: string, type = 'text/plain'): File {
  return new File([content], name, { type });
}

describe('importDocument', () => {
  it('imports plain text as escaped paragraphs', async () => {
    const result = await importDocument(textFile('Hello\n<script>alert(1)</script>', 'notes.txt'));

    expect(result).toMatchObject({ fileName: 'notes', format: 'txt' });
    expect(result.content).toBe('<p>Hello</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('sanitizes imported HTML', async () => {
    const result = await importDocument(
      textFile('<h1>Title</h1><p onclick="alert(1)" style="color: red; position: fixed">Safe</p>', 'page.html', 'text/html'),
    );

    expect(result.content).toContain('<h1>Title</h1>');
    expect(result.content).toContain('<p style="color: red;">Safe</p>');
    expect(result.content).not.toContain('onclick');
    expect(result.content).not.toContain('position');
  });

  it('imports RTF unicode escapes and line breaks', async () => {
    const result = await importDocument(textFile(String.raw`{\rtf1 Hallo \u252?\line Welt}`, 'unicode.rtf', 'application/rtf'));

    expect(result.content).toBe('<p>Hallo ü</p><p>Welt</p>');
  });

  it('imports FODT headings, links, lists and tables as sanitized editor HTML', async () => {
    const fodt = `<?xml version="1.0" encoding="UTF-8"?>
      <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
        xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
        xmlns:xlink="http://www.w3.org/1999/xlink">
        <office:body>
          <office:text>
            <text:h text:outline-level="1">Heading</text:h>
            <text:p>See <text:a xlink:href="https://example.com">Example</text:a><text:line-break/>Next</text:p>
            <text:list text:style-name="Numbered"><text:list-item text:start-value="4"><text:p>Fourth</text:p></text:list-item></text:list>
            <table:table><table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>Cell</text:p></table:table-cell></table:table-row></table:table>
          </office:text>
        </office:body>
      </office:document>`;

    const result = await importDocument(textFile(fodt, 'open.fodt', 'application/vnd.oasis.opendocument.text-flat-xml'));

    expect(result.content).toContain('<h1>Heading</h1>');
    expect(result.content).toContain('<a href="https://example.com">Example</a>');
    expect(result.content).toContain('<br>');
    expect(result.content).toContain('<ol start="4">');
    expect(result.content).toContain('<td colspan="2">');
  });

  it('imports ODT package images as data URLs', async () => {
    const zip = new JSZip();
    zip.file(
      'content.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
        xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
        xmlns:xlink="http://www.w3.org/1999/xlink">
        <office:body><office:text>
          <text:p><draw:frame draw:name="Dot"><draw:image xlink:href="Pictures/dot.png"/></draw:frame></text:p>
        </office:text></office:body>
      </office:document-content>`,
    );
    zip.file('Pictures/dot.png', 'abc');
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' });

    const result = await importDocument(new File([blob], 'image.odt', { type: 'application/vnd.oasis.opendocument.text' }));

    expect(result.content).toContain('<img src="data:image/png;base64,YWJj" alt="Dot">');
  });
});
