import { DEFAULT_DOCUMENT_FAMILY, resolveFamily } from '../fonts/catalog';
import { createFontKey, obfuscateFont, wordFaces } from '../fonts/embedding';
import { ExportFontRegistry } from '../fonts/registry';
import { noteGraphicFonts, prepareGraphicRenditions } from '../graphics/renditions';
import { languageTag } from '../shared';
import { noteDocumentFonts } from '../textUsage';
import { pageGeometry } from '../typography';
import type { ExportDocumentModel } from '../types';
import type { WarningCollector } from '../warnings';
import { DocxBodyWriter } from './body';
import {
  RELATIONSHIP_TYPES,
  appXml,
  contentTypesXml,
  coreXml,
  fontTableXml,
  packageRelsXml,
  relationshipsXml,
  sectionXml,
  settingsXml,
  stylesXml,
  type FontTableEntry,
  type Relationship,
} from './parts';

/**
 * DOCX: native WordprocessingML (heading styles, numbered lists, real
 * tables with merges and shading, hyperlinks, floating pictures), the
 * document's fonts embedded as static instances, and Smart Graphics as
 * pictures (PNG with an SVG for Office 2016+).
 */
export async function renderDocx(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  const registry = new ExportFontRegistry(warnings);
  noteDocumentFonts(registry, documentModel.blocks, { generated: false, graphicFallbacks: false });
  noteGraphicFonts(registry, documentModel);
  await registry.load({ instances: true, fallback: false });
  await prepareGraphicRenditions(documentModel, registry, warnings);

  const geometry = pageGeometry(documentModel.locale);
  const language = languageTag(documentModel.locale);
  // rId1–4 are the fixed parts below; content relationships follow.
  const fixed: Relationship[] = [
    { id: 'rId1', type: RELATIONSHIP_TYPES.styles, target: 'styles.xml' },
    { id: 'rId2', type: RELATIONSHIP_TYPES.numbering, target: 'numbering.xml' },
    { id: 'rId3', type: RELATIONSHIP_TYPES.settings, target: 'settings.xml' },
    { id: 'rId4', type: RELATIONSHIP_TYPES.fontTable, target: 'fontTable.xml' },
  ];
  const writer = new DocxBodyWriter(fixed.length + 1, geometry, warnings);
  const body = writer.flow(documentModel.blocks, 'root', { indent: 0 }) || '<w:p/>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${body.endsWith('</w:tbl>') ? '<w:p/>' : ''}${sectionXml(geometry)}</w:body></w:document>`;

  // Fonts: embed the self-hosted families (static instances), list the rest by name.
  const faces = wordFaces(registry);
  const fontRelationships: Relationship[] = [];
  const fontFiles: Array<{ path: string; bytes: Uint8Array }> = [];
  const entries: FontTableEntry[] = [];
  const embed = (bytes: Uint8Array) => {
    const key = createFontKey();
    const index = fontFiles.length + 1;
    const path = `fonts/font${index}.odttf`;
    fontFiles.push({ path: `word/${path}`, bytes: obfuscateFont(bytes, key) });
    const relationshipId = `rId${index}`;
    fontRelationships.push({ id: relationshipId, type: RELATIONSHIP_TYPES.font, target: path });
    return { relationshipId, key };
  };
  // The document font is referenced by the default run properties.
  const families = new Map(writer.families);
  const documentFamily = resolveFamily(DEFAULT_DOCUMENT_FAMILY);
  families.set(documentFamily.name, documentFamily);
  families.forEach((family) => {
    const face = faces.get(family.name);
    entries.push({
      family,
      ...(face?.regular ? { regular: embed(face.regular.bytes) } : {}),
      ...(face?.bold ? { bold: embed(face.bold.bytes) } : {}),
    });
  });

  const JSZip = await import('jszip').then((module) => module.default);
  const zip = new JSZip();
  const extensions = new Set(writer.media.map((entry) => entry.extension));
  if (fontFiles.length) extensions.add('odttf');
  zip.file('[Content_Types].xml', contentTypesXml(extensions));
  zip.file('_rels/.rels', packageRelsXml());
  zip.file('docProps/core.xml', coreXml(documentModel.name, language));
  zip.file('docProps/app.xml', appXml());
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relationshipsXml([...fixed, ...writer.relationships]));
  zip.file('word/styles.xml', stylesXml(language));
  zip.file('word/numbering.xml', writer.numbering.xml());
  zip.file('word/settings.xml', settingsXml(fontFiles.length > 0, language));
  zip.file('word/fontTable.xml', fontTableXml(entries));
  if (fontRelationships.length) zip.file('word/_rels/fontTable.xml.rels', relationshipsXml(fontRelationships));
  fontFiles.forEach((file) => zip.file(file.path, file.bytes));
  // Images and fonts are already compressed formats: store them as they are.
  writer.media.forEach((entry) => zip.file(entry.path, entry.bytes, entry.extension === 'svg' ? {} : { compression: 'STORE' }));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

