# Editable Smart Graphics in DOCX

## Export pipeline

`exportDocument` sanitizes document HTML and builds the shared block model. It
prepares images and captures Smart Graphics from `SmartGraphicCanvas` into a
`GraphicScene`. The capture records paths, text lines, colors, and coordinates
from the actual editor renderer, including the document direction.

The DOCX writer creates a ZIP package of WordprocessingML parts using JSZip:
`document.xml`, styles, numbering, settings, font table, relationships, metadata,
and media. Text, lists, tables, and links already use native Word elements.
Self-hosted fonts are embedded as obfuscated static TrueType faces.

Previously, DOCX called `prepareGraphicRenditions`: labels became glyph outlines
in an SVG, which was also rasterized to PNG. Word received a picture with an SVG
extension and alternative text. Neither the SVG outlines nor the PNG contained
editable label text.

## Options considered

- **Keep SVG/PNG pictures:** preserves appearance, but does not meet the editing
  requirement. Outlining text also prevents normal text editing.
- **Generate Office SmartArt diagrams:** would provide SmartArt's text pane and
  automatic layout. It requires a diagram data model, layout definition, style,
  and color parts. LWrite's custom layouts do not map directly to Office layout
  algorithms. This would require a separate layout implementation and validation
  against Word's regeneration of each diagram.
- **Native Word drawing groups:** translates the existing captured scene into
  editable freeform shapes and text boxes. It retains the editor's arrangement
  without introducing another layout engine. This is the implemented approach.

## Implemented behavior

`docx/graphics.ts` converts the framed scene into a Word 2010+ `wpg:wgp` group.
Paths become `wps:wsp` shapes with DrawingML custom geometry. Each captured text
line becomes a transparent Word text box with real `w:t` text, explicit font,
size, weight, italic style, alignment, and RTL properties. Graphic-only font
families participate in the existing font embedding pipeline.

The group can be moved/resized, and its shapes and labels can be edited in Word.
It is **not an Office SmartArt diagram**: it does not have the SmartArt text pane,
layout switching, automatic node insertion, or connectors attached to nodes.
Wrapped labels are separate text boxes per captured line.

Shape coordinates and text sizes scale together into the available page, list,
quote, or table-cell column. Tall graphics shrink to fit the printable page.
Groups have unique object IDs and descriptive alternative text. The supported
branch is wrapped in `mc:AlternateContent`; older readers receive a native VML
text box containing the title and hierarchical labels. No image rendition or
image relationship is generated for a Smart Graphic in DOCX.

Solid fills, linear-gradient directions/stops, alpha, strokes, Bézier curves,
and drop shadows use native drawing properties. Browser clipping is omitted;
soft box-shadow shapes are skipped, and shadow spread is omitted. These losses
emit `unsupported-style-dropped` warnings. Translucent text is composited over
white, and Word's font metrics can differ from browser metrics. If browser scene
capture is unavailable, the existing structured paragraph/list fallback and
`graphic-layout-simplified` warning remain.

Other export formats retain their existing rendering paths. Re-importing a
DOCX is still subject to the importer's support for Word drawing objects; this
change does not add a native shape-to-Smart-Graphic importer.

## Validation

Unit tests check native geometry, real editable text, XML escaping, font
embedding, unique IDs, markup compatibility, narrow cells, tall graphics,
effects warnings, RTL text, and missing-capture fallback. The production browser
suite checks every registered Smart Graphic layout for editable labels and the
absence of graphic media files, alongside the existing all-format export checks.
The generated mixed-content and all-layout DOCX fixtures also pass Microsoft
Open XML SDK 3.5.1 validation for both Office 2010 and Office 2013 with zero
errors. A LibreOffice Writer 7.4 open/save round trip preserves all 30 native
groups, their shape counts, and every editable label (191 text boxes), with no
graphic images. These checks do not replace an interactive Microsoft Word
compatibility test; Microsoft Word is not available in the development
environment.

## Format references

- [Microsoft: WordprocessingML drawing extensions](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/87221dc8-13de-4885-89b8-429c078ed191)
- [Microsoft: drawing groups and markup compatibility](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/d97ae943-93d6-47ff-a261-6fca341fc5a8)
- [Microsoft: WordprocessingGroup structure](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.word.drawinggroup.wordprocessinggroup)
- [Microsoft: WordprocessingShape structure](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.office2010.word.drawingshape.wordprocessingshape)
- [Microsoft: SmartArt layout definitions](https://learn.microsoft.com/en-us/archive/msdn-magazine/2007/february/create-custom-smartart-graphics-for-use-in-the-2007-office-system)
