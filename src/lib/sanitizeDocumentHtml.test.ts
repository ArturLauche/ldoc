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

  it('keeps document formatting and converts leftover smart diagrams to readable text', () => {
    const sanitized = sanitizeDocumentHtml(`
      <div data-smart-diagram="true" data-template="process" data-title="Plan" data-items="A|B">
        <span class="smart-diagram__node">A</span>
      </div>
      <ol start="4"><li>Fourth</li></ol>
      <p><strong>Bold</strong> <mark style="background-color: #fef08a">mark</mark></p>
    `);

    const parsed = new DOMParser().parseFromString(sanitized, 'text/html');
    expect(parsed.body.textContent).toContain('Plan: A -> B');
    expect(sanitized).not.toContain('data-smart-diagram');
    expect(sanitized).toContain('<ol start="4">');
    expect(sanitized).toContain('<strong>Bold</strong>');
    expect(sanitized).toContain('background-color');
  });

  it('keeps only safe editor style and class values', () => {
    const sanitized = sanitizeDocumentHtml(`
      <p class="text-primary hacked" style="color: rgb(10, 20, 30); position: fixed; width: 50%; background-image: url(javascript:alert(1))">Text</p>
      <span style="font-size: 18px; line-height: 1.5; behavior: url(#bad)">Size</span>
      <div class="unknown" contenteditable="true">Diagram</div>
    `);

    expect(sanitized).toContain('class="text-primary"');
    expect(sanitized).toContain('style="color: rgb(10, 20, 30); width: 50%;"');
    expect(sanitized).toContain('style="font-size: 18px; line-height: 1.5;"');
    expect(sanitized).toContain('<div>Diagram</div>');
    expect(sanitized).not.toContain('position');
    expect(sanitized).not.toContain('background-image');
    expect(sanitized).not.toContain('behavior');
    expect(sanitized).not.toContain('contenteditable');
  });

  it('keeps table structure, column widths and cell fills', () => {
    const sanitized = sanitizeDocumentHtml(`
      <table style="min-width: 240px" data-borders="visible">
        <colgroup><col style="width: 120px"></colgroup>
        <tr>
          <th colwidth="120" data-background-color="#FEF08A">Head</th>
          <td style="background-color: rgb(10, 20, 30)">Cell<script>alert(1)</script></td>
        </tr>
      </table>
    `);

    expect(sanitized).toContain('<table');
    expect(sanitized).toContain('<colgroup>');
    expect(sanitized).toContain('width: 120px');
    expect(sanitized).toContain('min-width: 240px');
    expect(sanitized).toContain('colwidth="120"');
    expect(sanitized).toContain('background-color: rgb(10, 20, 30)');
    expect(sanitized).toContain('data-background-color="#FEF08A"');
    expect(sanitized).not.toContain('<script>');
  });

  it('keeps sanitized smart graphics and converts malformed or oversized payloads to text', () => {
    const graphic = {
      version: 1,
      layoutId: 'process-chevron',
      colorSet: 'blue',
      style: 'filled',
      title: 'Launch',
      items: [
        { id: 'a1', label: 'Alpha', children: [] },
        { id: 'b2', label: 'Beta', children: [] },
      ],
    };
    const sanitized = sanitizeDocumentHtml(`
      <div data-lwrite-graphic='${JSON.stringify(graphic)}' contenteditable="true">
        <script>alert(1)</script>
        <p>Ignore me</p>
      </div>
    `);

    expect(sanitized).toContain('data-lwrite-graphic');
    expect(sanitized).toContain('contenteditable="false"');
    expect(sanitized).toContain('class="lwrite-graphic"');
    expect(sanitized).toContain('<ul>');
    expect(sanitized).toContain('Alpha');
    expect(sanitized).toContain('Beta');
    expect(sanitized).toContain('Launch');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('Ignore me');

    const malformed = sanitizeDocumentHtml(
      '<div data-lwrite-graphic="{not json}"><script>alert(1)</script><ul><li>Visible copy</li></ul></div>',
    );
    expect(malformed).toContain('Visible copy');
    expect(malformed).not.toContain('alert(1)');
    expect(malformed).toContain('data-lwrite-graphic');

    const emptyMalformed = sanitizeDocumentHtml('<div data-lwrite-graphic="{not json}"></div>');
    expect(emptyMalformed).not.toContain('data-lwrite-graphic');

    const oversized = sanitizeDocumentHtml(
      `<div data-lwrite-graphic="${'x'.repeat(20_001)}">Huge</div>`,
    );
    expect(oversized).toContain('Huge');
    expect(oversized).not.toContain('x'.repeat(50));
  });
});

