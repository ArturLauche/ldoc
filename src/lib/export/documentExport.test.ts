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
});

