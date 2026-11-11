import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentReference } from "./document-references";
import { clearCitedPageCache, loadDocumentPages, loadDocumentView, loadPageImages, peekPageImage, processedDocumentMarkdown } from "./processed-document";

const reference: DocumentReference = {
  fileId: "doc-1",
  title: "CY26 RHEL",
  pipeline: "analyzeproductrhel",
  pages: [],
  passages: [{ page: null, text: "short passage", chunkId: "path#1" }],
  images: [],
};

describe("processedDocumentMarkdown", () => {
  beforeEach(() => {
    clearCitedPageCache();
  });
  it("reads the document body and decodes entities", () => {
    const payload = {
      content: [{
        type: "text",
        text: `Processed document:\n${JSON.stringify({ markdown_content: "R&amp;D {kept}" })}`,
      }],
    };
    expect(processedDocumentMarkdown(payload)).toBe("R&D {kept}");
  });

  it("returns nothing when the tool reports an error", () => {
    expect(processedDocumentMarkdown({ isError: true, content: [{ type: "text", text: "{}" }] })).toBe("");
  });
});

describe("loadDocumentView", () => {
  beforeEach(() => {
    clearCitedPageCache();
  });

  it("loads the processed document and the page image", async () => {
    const callTool = vi.fn(async (_mcp: string, name: string) => {
      if (name === "get_processed_document") {
        return { content: [{ type: "text", text: `Doc:\n${JSON.stringify({ markdown_content: "## Strategy" })}` }] };
      }
      return { content: [{ type: "image", data: "abc", mimeType: "image/png" }] };
    });
    const view = await loadDocumentView(reference, callTool);
    expect(view.markdown).toBe("## Strategy");
    expect(view.images).toEqual([{ mimeType: "image/png", data: "abc" }]);
    expect(callTool).toHaveBeenCalledWith("unstructured-mcp", "get_citation_image", {
      pipeline_name: "analyzeproductrhel",
      chunk_id: "path#1",
    });
  });

  it("reports the first page before the later pages return", async () => {
    let releaseSecond: () => void = () => undefined;
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const callTool = vi.fn(async (_mcp: string, _name: string, args: { chunk_id?: string }) => {
      if (args.chunk_id === "b") await second;
      return { content: [{ type: "image", data: args.chunk_id, mimeType: "image/png" }] };
    });
    const seen: string[][] = [];
    const pending = loadDocumentPages("productstrategycy26", ["a", "b"], [], callTool, (images) => {
      seen.push(images.map((image) => image.data));
    });
    await vi.waitFor(() => expect(seen[0]).toEqual(["a"]));
    releaseSecond();
    await pending;
    expect(seen.at(-1)).toEqual(["a", "b"]);
  });

  it("keeps the retrieved passage when the document call fails", async () => {
    const callTool = vi.fn(async () => {
      throw new Error("down");
    });
    const view = await loadDocumentView({ ...reference, passages: [{ ...reference.passages[0], chunkId: null }] }, callTool);
    expect(view.markdown).toBe("short passage");
    expect(view.images).toEqual([]);
  });

  it("reuses a page image that was already fetched", async () => {
    const callTool = vi.fn(async () => ({ content: [{ type: "image", data: "cached", mimeType: "image/png" }] }));
    await loadPageImages("productstrategycy26", "chunk-9", [], callTool);
    expect(peekPageImage("productstrategycy26", "chunk-9")?.data).toBe("cached");
    await loadPageImages("productstrategycy26", "chunk-9", [], callTool);
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
