import { describe, expect, it } from 'vitest';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';

describe('sanitizeDocumentHtml', () => {
  it('removes executable content and unsafe URLs', () => {
    const sanitized = sanitizeDocumentHtml(`
      <p onclick="alert(1)">Hello</p>
      <script>alert(1)</script>
      <a href="java\nscript:alert(1)" target="_blank">bad link</a>
      <img src="data:text/html;base64,PHNjcmlwdD4=" onerror="alert(1)">
    `);

    expect(sanitized).toContain('<p>Hello</p>');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('data:text/html');
  });

  it('keeps document formatting and smart diagram attributes', () => {
    const sanitized = sanitizeDocumentHtml(`
      <div data-smart-diagram="true" data-template="process" data-title="Plan" data-items="A|B">
        <span class="smart-diagram__node">A</span>
      </div>
      <p><strong>Bold</strong> <mark style="background-color: #fef08a">mark</mark></p>
    `);

    expect(sanitized).toContain('data-smart-diagram="true"');
    expect(sanitized).toContain('data-items="A|B"');
    expect(sanitized).toContain('<strong>Bold</strong>');
    expect(sanitized).toContain('background-color');
  });
});

