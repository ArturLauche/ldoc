import { describe, expect, it } from 'vitest';
import { buildExportFileName, sanitizeBaseFileName } from './fileNames';

describe('fileNames', () => {
  it('removes dangerous filename characters and trims empty names', () => {
    expect(sanitizeBaseFileName(' ../My: Bad/File?.docx ')).toBe('My- Bad-File-.docx');
    expect(sanitizeBaseFileName('   ')).toBe('Untitled Document');
  });

  it('replaces an existing extension with the requested export extension', () => {
    expect(buildExportFileName('Report.docx', 'pdf')).toBe('Report.pdf');
  });
});

