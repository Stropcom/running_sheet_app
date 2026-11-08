import { describe, expect, it } from "vitest";
import {
  checkStoredDocument,
  isRunnableWhenOpened,
} from "@shared/documentUpload";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("checkStoredDocument", () => {
  it("accepts a PDF and says it is one", () => {
    const r = checkStoredDocument(bytes("%PDF-1.7\n%âãÏÓ\n1 0 obj"));
    expect(r).toEqual({ ok: true, ext: "pdf", mime: "application/pdf" });
  });
  it("accepts a Word .docx (a zip that holds word/document.xml)", () => {
    const r = checkStoredDocument(
      bytes("PK\u0003\u0004....[Content_Types].xml....word/document.xml....")
    );
    expect(r.ok && r.ext).toBe("docx");
  });
  it("refuses an HTML page, whatever it is called", () => {
    const r = checkStoredDocument(
      bytes("<html><script>alert(document.cookie)</script></html>")
    );
    expect(r.ok).toBe(false);
  });
  it("refuses a plain zip, an image and an empty file", () => {
    expect(checkStoredDocument(bytes("PK\u0003\u0004 just a zip")).ok).toBe(
      false
    );
    expect(checkStoredDocument(bytes("\u0089PNG\r\n\u001a\n")).ok).toBe(false);
    expect(checkStoredDocument(new Uint8Array()).ok).toBe(false);
  });
  it("refuses HTML that merely mentions PDF later in the file", () => {
    const filler = "x".repeat(2000);
    expect(
      checkStoredDocument(bytes(`<html>${filler}%PDF-1.4</html>`)).ok
    ).toBe(false);
  });
});

describe("isRunnableWhenOpened", () => {
  it("flags files a browser would run, not documents or photos", () => {
    for (const p of ["a/x.html", "a/x.HTM", "a/x.svg", "a/x.xml", "a/x.js"])
      expect(isRunnableWhenOpened(p)).toBe(true);
    for (const p of ["a/x.pdf", "a/x.docx", "a/x.jpeg", "a/x.png"])
      expect(isRunnableWhenOpened(p)).toBe(false);
  });
});
