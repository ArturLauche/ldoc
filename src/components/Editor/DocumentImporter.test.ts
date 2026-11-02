import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { assertOdtSpaceExpansion, importDocument } from './DocumentImporter';

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
      textFile(
        '<h1>Title</h1><p onclick="alert(1)" style="color: red; position: fixed">Safe</p>',
        'page.html',
        'text/html',
      ),
    );

    expect(result.content).toContain('<h1>Title</h1>');
    expect(result.content).toContain('<p style="color: red;">Safe</p>');
    expect(result.content).not.toContain('onclick');
    expect(result.content).not.toContain('position');
  });

  it('imports RTF unicode escapes and line breaks', async () => {
    const result = await importDocument(
      textFile(String.raw`{\rtf1 Hallo \u252?\line Welt}`, 'unicode.rtf', 'application/rtf'),
    );

    expect(result.content).toBe('<p>Hallo ü</p><p>Welt</p>');
  });

  it('skips escaped RTF fallback characters instead of leaving fragments', async () => {
    const result = await importDocument(
      textFile(String.raw`{\rtf1 \uc1\u252\'fc und \uc2\u8364\'80\'80 Ende}`, 'fallback.rtf', 'application/rtf'),
    );

    expect(result.content).toBe('<p>ü und € Ende</p>');
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

    const result = await importDocument(
      textFile(fodt, 'open.fodt', 'application/vnd.oasis.opendocument.text-flat-xml'),
    );

    expect(result.content).toContain('<h1>Heading</h1>');
    expect(result.content).toContain('<a href="https://example.com">Example</a>');
    expect(result.content).toContain('<br>');
    expect(result.content).toContain('<ol start="4">');
    expect(result.content).toContain('<td colspan="2">');
  });

  it('preserves OpenDocument tabs as visible spacing', async () => {
    const fodt = `<?xml version="1.0" encoding="UTF-8"?>
      <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
        <office:body><office:text>
          <text:p>A<text:tab/>B</text:p>
        </office:text></office:body>
      </office:document>`;

    const result = await importDocument(
      textFile(fodt, 'tabs.fodt', 'application/vnd.oasis.opendocument.text-flat-xml'),
    );

    expect(result.content).toBe('<p>A&nbsp;&nbsp;&nbsp;&nbsp;B</p>');
  });

  it('reads numbering from OpenDocument list styles, not their names', async () => {    const fodt = `<?xml version="1.0" encoding="UTF-8"?>
      <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
        xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">
        <office:automatic-styles>
          <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>
          <text:list-style style:name="L2"><text:list-level-style-bullet text:level="1"/></text:list-style>
        </office:automatic-styles>
        <office:body>
          <office:text>
            <text:list text:style-name="L1"><text:list-item><text:p>First</text:p></text:list-item></text:list>
            <text:list text:style-name="L2"><text:list-item><text:p>Second</text:p></text:list-item></text:list>
          </office:text>
        </office:body>
      </office:document>`;

    const result = await importDocument(
      textFile(fodt, 'lists.fodt', 'application/vnd.oasis.opendocument.text-flat-xml'),
    );

    expect(result.content).toContain('<ol><li><p>First</p></li></ol>');
    expect(result.content).toContain('<ul><li><p>Second</p></li></ul>');
  });

  it('reads OpenDocument inline emphasis from named text styles', async () => {
    const fodt = `<?xml version="1.0" encoding="UTF-8"?>
      <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
        xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
        xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
        <office:automatic-styles>
          <style:style style:name="T1" style:family="text">
            <style:text-properties fo:font-weight="bold"/>
          </style:style>
          <style:style style:name="T2" style:family="text" style:parent-style-name="T1">
            <style:text-properties fo:font-style="italic"/>
          </style:style>
          <style:style style:name="T3" style:family="text">
            <style:text-properties fo:font-weight="normal"/>
          </style:style>
        </office:automatic-styles>
        <office:body>
          <office:text>
            <text:p>Plain <text:span text:style-name="T1">bold</text:span> <text:span text:style-name="T2">both</text:span> <text:span text:style-name="T3">normal</text:span></text:p>
          </office:text>
        </office:body>
      </office:document>`;

    const result = await importDocument(
      textFile(fodt, 'emphasis.fodt', 'application/vnd.oasis.opendocument.text-flat-xml'),
    );

    expect(result.content).toBe(
      '<p>Plain <strong>bold</strong> <em><strong>both</strong></em> normal</p>',
    );
  });

  it('keeps OpenDocument table rows inside header and row-group wrappers', async () => {
    const fodt = `<?xml version="1.0" encoding="UTF-8"?>
      <office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
        xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
        xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
        <office:body>
          <office:text>
            <table:table>
              <table:table-header-rows><table:table-row><table:table-cell><text:p>Head</text:p></table:table-cell></table:table-row></table:table-header-rows>
              <table:table-row-group><table:table-row><table:table-cell><text:p>Body</text:p></table:table-cell></table:table-row></table:table-row-group>
            </table:table>
          </office:text>
        </office:body>
      </office:document>`;

    const result = await importDocument(
      textFile(fodt, 'table.fodt', 'application/vnd.oasis.opendocument.text-flat-xml'),
    );

    expect(result.content).toContain('<td><p>Head</p></td>');
    expect(result.content).toContain('<td><p>Body</p></td>');
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
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.oasis.opendocument.text',
    });

    const result = await importDocument(
      new File([blob], 'image.odt', {
        type: 'application/vnd.oasis.opendocument.text',
      }),
    );

    expect(result.content).toContain('<img src="data:image/png;base64,YWJj" alt="Dot">');
  });
});

it.each(['odt', 'fodt'])(
  'rejects malformed %s documents instead of reporting successful text imports',
  async (extension) => {
    await expect(
      importDocument(new File(['binary garbage'], `invalid.${extension}`)),
    ).rejects.toThrow();
  },
);

it('rejects oversized files before reading them', async () => {
  const file = new File(['tiny'], 'huge.txt');
  Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 + 1 });
  await expect(importDocument(file)).rejects.toThrow('too large');
});

it('preserves common bold and italic tags from imported HTML', async () => {
  const result = await importDocument(
    new File(['<p><b>Bold</b> <i>Italic</i></p>'], 'document.html'),
  );
  expect(result.content).toContain('<b>Bold</b>');
  expect(result.content).toContain('<i>Italic</i>');
});

it.each(['odt', 'ott', 'docx'])(
  'bounds actual expansion of a compact %s archive before conversion',
  async (extension) => {
    const zip = new JSZip();
    zip.file(
      extension === 'docx' ? 'word/document.xml' : 'content.xml',
      'a'.repeat(20 * 1024 * 1024 + 1),
    );
    const data = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    });
    expect(data.byteLength).toBeLessThan(100_000);
    await expect(
      importDocument(new File([Uint8Array.from(data)], `large.${extension}`)),
    ).rejects.toThrow('size limit');
  },
);

it('counts all expanded archive entries against a shared budget', async () => {
  const zip = new JSZip();
  for (let i = 0; i < 3; i++) zip.file(`Pictures/image-${i}.png`, new Uint8Array(7 * 1024 * 1024));
  zip.file('content.xml', '<office:document/>');
  const data = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
  await expect(importDocument(new File([Uint8Array.from(data)], 'images.odt'))).rejects.toThrow(
    'size limit',
  );
});

it('rejects an individual embedded image over 10 MB before base64 conversion', async () => {
  const zip = new JSZip();
  zip.file('word/media/image.png', new Uint8Array(10 * 1024 * 1024 + 1));
  const data = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
  await expect(importDocument(new File([Uint8Array.from(data)], 'image.docx'))).rejects.toThrow(
    'size limit',
  );
});

it('clamps absurd OpenDocument space counts instead of expanding them', async () => {
  const xml = `<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p><text:s text:c="2000000000"/></text:p></office:text></office:body></office:document>`;
  const result = await importDocument(new File([xml], 'spaces.fodt'));
  expect(result.content).toBe(`<p>${'&nbsp;'.repeat(100)}</p>`);
});

it('counts the six-character expansion of every repeated OpenDocument space', () => {
  const xml = `<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p><text:s text:c="100"/><text:s text:c="100"/></text:p></office:text></office:body></office:document>`;
  const officeText = new DOMParser()
    .parseFromString(xml, 'text/xml')
    .getElementsByTagName('office:text')[0];

  // Two clamped 100-space runs become 1,200 characters of `&nbsp;` markup.
  expect(() => assertOdtSpaceExpansion(officeText, 1_199)).toThrow('size limit');
  expect(() => assertOdtSpaceExpansion(officeText, 1_200)).not.toThrow();
});
