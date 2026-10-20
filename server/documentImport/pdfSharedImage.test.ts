import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { getPdfObject, readPdfText } from "./pdfTextReader";

describe("getPdfObject", () => {
  const never = { get: () => undefined };
  const answers = (data: unknown) => ({
    get: (_id: string, cb: (d: unknown) => void) => cb(data),
  });

  it("asks the document-wide store for an image shared between pages (g_ ids)", async () => {
    const page = { objs: never, commonObjs: answers("shared") };
    expect(await getPdfObject(page, "g_d0_img_p1_1", 50)).toBe("shared");
  });

  it("asks the page's own store for a page-only image", async () => {
    const page = { objs: answers("own"), commonObjs: never };
    expect(await getPdfObject(page, "img_p0_1", 50)).toBe("own");
  });

  it("gives up on an image that never answers instead of waiting forever", async () => {
    const page = { objs: never, commonObjs: never };
    const t = Date.now();
    expect(await getPdfObject(page, "img_p0_1", 40)).toBeUndefined();
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("treats a store that throws as no image", async () => {
    const boom = {
      get: () => {
        throw new Error("nope");
      },
    };
    expect(
      await getPdfObject({ objs: boom, commonObjs: boom }, "img_p0_1", 50)
    ).toBeUndefined();
  });
});

describe("readPdfText with an image repeated on every page", () => {
  it("returns instead of hanging, and offers a photograph repeated on every page once", async () => {
    // Noise reads as a photograph to the entropy check.
    const w = 300;
    const h = 400;
    const noise = Buffer.alloc(w * h * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
    const jpg = await sharp(noise, {
      raw: { width: w, height: h, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const img = await doc.embedJpg(jpg);
    for (let i = 0; i < 3; i++) {
      const page = doc.addPage([595, 842]);
      page.drawText("NAME: Marcus VELASCO", { x: 40, y: 780, size: 11, font });
      page.drawImage(img, { x: 40, y: 400, width: 150, height: 200 });
    }
    const read = await readPdfText(Buffer.from(await doc.save()));
    // Page 1 holds it under its own id and pdf.js shares it document-wide from
    // page 2; it is the same photograph, so the import offers it once.
    expect(read.images.length).toBe(1);
  }, 20_000);
});
