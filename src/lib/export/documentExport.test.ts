import { describe, expect, it } from 'vitest';
import { exportDocument } from './documentExport';

describe('exportDocument', () => {
  it('exports sanitized plain text', async () => {
    const result = await exportDocument({
      html: '<h1>Title</h1><p onclick="alert(1)">Body</p><script>alert(1)</script>',
      name: 'My Report',
      locale: 'en',
      format: 'txt',
    });

    await expect(result.blob.text()).resolves.toBe('Title\nBody');
    expect(result.fileName).toBe('My Report.txt');
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
  });

  it('handles special WinAnsi characters in PDF export', async () => {
    const result = await exportDocument({
      html: '<p>Euro: € and Smart Quotes: “”</p>',
      name: 'Special',
      locale: 'en',
      format: 'pdf',
    });

    expect(result.blob.type).toBe('application/pdf');
    expect(result.fileName).toBe('Special.pdf');
    // Note: We can't easily inspect PDF binary content for exact octal strings here without a PDF parser,
    // but we verify the export completes successfully.
  });

  it('handles long lines in PDF export with improved wrapping', async () => {
    const longText = 'This is a very long line that should be wrapped multiple times to ensure the new wrapping logic works correctly and avoids overflowing the page boundaries. '.repeat(5);
    const result = await exportDocument({
      html: `<p>${longText}</p>`,
      name: 'Wrapping',
      locale: 'en',
      format: 'pdf',
    });

    expect(result.blob.type).toBe('application/pdf');
    expect(result.fileName).toBe('Wrapping.pdf');
  });

  it('gracefully handles missing images in PDF export', async () => {
    const result = await exportDocument({
      html: '<p>Image follow:</p><img src="nonexistent.jpg" alt="Failed Image">',
      name: 'ImageFail',
      locale: 'en',
      format: 'pdf',
    });

    expect(result.blob.type).toBe('application/pdf');
    expect(result.fileName).toBe('ImageFail.pdf');
  });
});

