# REST API Document Conversion Guide

This note explains how to convert REST Markdown docs to DOCX/PDF in a way that matches the existing style used by REST ManageAcct.

## Purpose

- Keep authoring in Markdown.
- Generate DOCX for Google Drive and team review.
- Generate PDF for static sharing.

## Prerequisites

1. Pandoc must be installed and available on PATH.
2. For DOCX to PDF conversion in terminal, LibreOffice must be installed and available as `soffice`.
3. Template source file: `docs/REST_API/REST ManageAcct.docx`.

## Verify Tools

```bash
command -v pandoc
command -v soffice
```

If either command prints nothing, install the missing tool first.

## One-Command Script (Recommended)

Use the helper script to generate DOCX (and PDF by default):

```bash
bash tools/convert-rest-doc.sh docs/REST_API/REST_Discover.md
```

Generate DOCX only (skip PDF):

```bash
bash tools/convert-rest-doc.sh docs/REST_API/REST_Discover.md --no-pdf
```

Default behavior with no file argument:

```bash
bash tools/convert-rest-doc.sh
```

This defaults to `docs/REST_API/REST_Discover.md`.

## Convert Markdown to DOCX (Template-Matched)

Example for Discover:

```bash
pandoc "docs/REST_API/REST_Discover.md" \
  --from gfm \
  --to docx \
  --reference-doc="docs/REST_API/REST ManageAcct.docx" \
  --output "docs/REST_API/REST_Discover.docx"
```

## Convert DOCX to PDF (LibreOffice Headless)

```bash
soffice --headless \
  --convert-to pdf \
  --outdir "docs/REST_API" \
  "docs/REST_API/REST_Discover.docx"
```

Output:

- `docs/REST_API/REST_Discover.docx`
- `docs/REST_API/REST_Discover.pdf`

## Google Drive Workflow

1. Upload the generated DOCX file to Google Drive.
2. Open in Google Docs for team edits/comments.
3. Use Google Docs export if needed:
   - File > Download > PDF Document (.pdf)

## VS Code Extension Notes

- `chrischinchilla.vscode-pandoc` is useful for editor-triggered exports, but still requires Pandoc installed in the environment.
- `pptxviewerpro.pptx-viewer-pro` is a PowerPoint viewer and does not replace Pandoc/LibreOffice for Markdown to DOCX/PDF conversion.
