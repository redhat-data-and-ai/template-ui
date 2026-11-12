import { describe, expect, it } from "vitest";
import { citationImagesFromContent } from "./citation-images";

describe("citationImagesFromContent", () => {
  it("keeps png and jpeg blocks and drops text", () => {
    const images = citationImagesFromContent([
      { type: "text", text: "Citation for chunk, 1 page(s): 94" },
      { type: "image", base64: "abc", mime_type: "image/png" },
      { type: "image", data: "def", mimeType: "image/jpeg" },
    ]);
    expect(images).toEqual([
      { mimeType: "image/png", data: "abc" },
      { mimeType: "image/jpeg", data: "def" },
    ]);
  });

  it("returns nothing for a plain string", () => {
    expect(citationImagesFromContent("Citation for chunk")).toEqual([]);
  });

  it("rejects a non-image mime and a remote url", () => {
    const images = citationImagesFromContent([
      { type: "image", data: "abc", mimeType: "image/svg+xml" },
      { type: "image", data: "https://example.com/a.png", mimeType: "image/png" },
    ]);
    expect(images).toEqual([]);
  });
});
