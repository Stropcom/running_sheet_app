/**
 * Regression tests for the image-extraction half of the document-import
 * readers (readDocxTables/readPdfText) — pulling photos embedded in an
 * imported target-profile document into ExtractedDocumentImage[] so they
 * can be reviewed, uploaded and run through on-device face recognition
 * (see ImportTargetDocumentDialog.tsx / AddTargetDialog.tsx's
 * saveStagedImages). No pre-made fixture in __fixtures__ has an embedded
 * photo, so these build minimal real documents at test time instead: a
 * .docx via JSZip (word/media/* is just literal files in the zip) and a
 * .pdf via pdf-lib (a genuine embedded image XObject, plus real drawn text
 * so the "no text layer" early-return doesn't discard it — see
 * pdfTextReader.ts's own module comment on why a scanned PDF's images are
 * deliberately never surfaced).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readDocxTables } from "./docxTableReader";
import { readPdfText } from "./pdfTextReader";

// A real training PDF (Operation ORCHARD) with one genuine embedded portrait
// photo. Regression fixture for a real bug: pdf.js's Node (non-canvas)
// fallback path decodes some real-world images into a Uint8ClampedArray
// rather than a plain Uint8Array, and isRawPdfImage's own runtime guard only
// ever checked for Uint8Array, silently discarding every image that decoded
// this way — a real photo extracting to zero images. The PDFDocument built
// at test time below (via pdf-lib's embedPng) happens to decode via a
// different pdf.js path that already returns a plain Uint8Array, which is
// exactly why that synthetic test never caught this — only a real embedded
// photo exercises the code path this guards. Independently confirmed
// against a second real document (Operation NIGHTJAR) with the same shape
// during triage; not added as its own fixture since it exercises the exact
// same code path.
const PDF_EMBEDDED_PHOTO_CLAMPED_ARRAY_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-embedded-photo-clamped-array.pdf"
);

const MINIMAL_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>NAME: John Alawishes DOE</w:t></w:r></w:p>
  </w:body>
</w:document>`;

async function buildDocxWithImages(
  images: { name: string; buffer: Buffer }[]
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", MINIMAL_DOCUMENT_XML);
  for (const img of images) {
    zip.file(`word/media/${img.name}`, img.buffer);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 90, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe("readDocxTables — image extraction", () => {
  it("extracts a real embedded photo from word/media", async () => {
    const photo = await makePng(300, 240);
    const buffer = await buildDocxWithImages([
      { name: "image1.png", buffer: photo },
    ]);
    const result = await readDocxTables(buffer);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].width).toBe(300);
    expect(result.images[0].height).toBe(240);
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[0].dataBase64.length).toBeGreaterThan(0);
  });

  it("filters out a tiny decorative image (logo/icon/divider)", async () => {
    const icon = await makePng(40, 40);
    const buffer = await buildDocxWithImages([
      { name: "image1.png", buffer: icon },
    ]);
    const result = await readDocxTables(buffer);
    expect(result.images).toHaveLength(0);
  });

  it("extracts a genuine photo while filtering a co-located tiny icon", async () => {
    const photo = await makePng(320, 320);
    const icon = await makePng(24, 24);
    const buffer = await buildDocxWithImages([
      { name: "image1.png", buffer: icon },
      { name: "image2.png", buffer: photo },
    ]);
    const result = await readDocxTables(buffer);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].width).toBe(320);
  });

  it("skips an undecodable media entry instead of failing the whole read", async () => {
    const buffer = await buildDocxWithImages([
      { name: "drawing1.wmf", buffer: Buffer.from("not a real wmf") },
    ]);
    const result = await readDocxTables(buffer);
    expect(result.images).toHaveLength(0);
    expect(result.paragraphs).toContain("NAME: John Alawishes DOE");
  });
});

describe("readPdfText — image extraction", () => {
  it("extracts a real embedded photo from a typed PDF page", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 500]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // Plain narrative text, not a recognised "LABEL: value" line — this
    // test only needs SOME real text layer present (see the module
    // comment on why a scanned PDF with no text discards its images), not
    // to exercise the label/table parsing itself.
    page.drawText("Subject sighted at the address on file.", {
      x: 20,
      y: 460,
      size: 12,
      font,
    });
    const photo = await makePng(300, 220);
    const pngImage = await pdfDoc.embedPng(photo);
    page.drawImage(pngImage, { x: 20, y: 100, width: 300, height: 220 });
    const pdfBytes = await pdfDoc.save();

    const result = await readPdfText(Buffer.from(pdfBytes));
    expect(result.paragraphs.join(" ")).toContain(
      "Subject sighted at the address on file."
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].width).toBe(300);
    expect(result.images[0].height).toBe(220);
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("filters out a tiny embedded image on a typed PDF page", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 500]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("NAME: John Alawishes DOE", {
      x: 20,
      y: 460,
      size: 12,
      font,
    });
    const icon = await makePng(30, 30);
    const pngImage = await pdfDoc.embedPng(icon);
    page.drawImage(pngImage, { x: 20, y: 100, width: 30, height: 30 });
    const pdfBytes = await pdfDoc.save();

    const result = await readPdfText(Buffer.from(pdfBytes));
    expect(result.images).toHaveLength(0);
  });

  it("discards images from a page with no text layer (scanned-PDF case)", async () => {
    // No drawText call at all — mirrors a scanned/photographed PDF, where
    // the "image" found is the whole page scan, not a discrete photo (see
    // the module comment on why this is deliberately excluded).
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 500]);
    const photo = await makePng(300, 220);
    const pngImage = await pdfDoc.embedPng(photo);
    page.drawImage(pngImage, { x: 20, y: 100, width: 300, height: 220 });
    const pdfBytes = await pdfDoc.save();

    const result = await readPdfText(Buffer.from(pdfBytes));
    expect(result.tables).toHaveLength(0);
    expect(result.paragraphs).toHaveLength(0);
    expect(result.images).toHaveLength(0);
  });

  it("extracts a real embedded photo that pdf.js decodes as a Uint8ClampedArray, not just a plain Uint8Array (the ORCHARD/NIGHTJAR bug)", async () => {
    const result = await readPdfText(
      readFileSync(PDF_EMBEDDED_PHOTO_CLAMPED_ARRAY_FIXTURE)
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0].width).toBe(343);
    expect(result.images[0].height).toBe(458);
    expect(result.images[0].mimeType).toBe("image/png");

    // Decodes to a real, uncorrupted PNG at the right dimensions — not just
    // present, but actually valid image data (guards against a fix that
    // passes the type check but feeds sharp the wrong channel count).
    const png = Buffer.from(result.images[0].dataBase64, "base64");
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(343);
    expect(meta.height).toBe(458);
  });
});
