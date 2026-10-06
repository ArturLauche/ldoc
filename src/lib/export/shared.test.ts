import { describe, expect, it } from 'vitest';
import { asciiUri, bytesToHex, linkTarget } from './shared';

describe('linkTarget', () => {
  it('classifies the link forms the editor accepts', () => {
    expect(linkTarget('https://example.com/')).toEqual({ kind: 'web', href: 'https://example.com/' });
    expect(linkTarget('mailto:a@example.com')).toEqual({ kind: 'web', href: 'mailto:a@example.com' });
    expect(linkTarget('./notes.txt')).toEqual({ kind: 'relative', href: './notes.txt' });
    expect(linkTarget('../notes.txt')).toEqual({ kind: 'relative', href: '../notes.txt' });
    expect(linkTarget('/privacy')).toEqual({ kind: 'relative', href: '/privacy' });
    expect(linkTarget('#%C3%9Cbersicht')).toEqual({ kind: 'fragment', name: 'Übersicht', top: false });
    expect(linkTarget('#')).toMatchObject({ top: true });
    expect(linkTarget('#Top')).toMatchObject({ top: true });
    expect(linkTarget('#%E0%A4%A')).toEqual({ kind: 'fragment', name: '%E0%A4%A', top: false });
  });

  it('percent-encodes what a 7-bit URI cannot carry', () => {
    expect(asciiUri('./my notes/Ü.txt')).toBe('./my%20notes/%C3%9C.txt');
    expect(asciiUri('https://example.com/a%20b?q=1#x')).toBe('https://example.com/a%20b?q=1#x');
    expect(asciiUri('./\uD800.txt')).toBe('./%EF%BF%BD.txt');
  });
});

describe('bytesToHex', () => {
  it('writes lowercase hex with optional line breaks', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
    expect(bytesToHex(new Uint8Array([1, 2, 3, 4, 5]), 2)).toBe('0102\n0304\n05');
    expect(bytesToHex(new Uint8Array([1, 2, 3, 4]), 2)).toBe('0102\n0304');
    expect(bytesToHex(new Uint8Array(0), 2)).toBe('');
  });
});
