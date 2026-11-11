import { describe, expect, it } from "vitest";
import { citationTargetsInChunkResult, citationTargetsInText, documentReferences, fileIdFromCitationHref, fileIdFromDocumentUrl, isInAppHref, joinSplitCitationLinks, viewerPages } from "./document-references";

const CHUNK = {
  file_id: "doc-1",
  chunk_id: "pipelines/a.pdf#4",
  chunk_text: "RHEL strategy\nStandardize on security.",
  regions: [{ pageNo: 3, bbox: [0, 0, 1, 1], image: "page.png" }],
};

describe("joinSplitCitationLinks", () => {
  it("puts a wrapped title and file path back on one line", () => {
    const href = "pipelines/productstrategycy26/stages/crawl/1nv5kjjHtWqhp6F_QwSuYH3TWdmvoLF0YMZSm7_9oWdM.pdf";
    const raw = `in 2028 [Red Hat AI CY2026 Product Strategy]\n(${href}) .`;
    expect(joinSplitCitationLinks(raw)).toBe(
      `in 2028 [Red Hat AI CY2026 Product Strategy](${href}) .`,
    );
    const wrapped = `[Red\nHat AI CY2026 Product Strategy, p.12]\n(${href})`;
    expect(joinSplitCitationLinks(wrapped)).toBe(
      `[Red Hat AI CY2026 Product Strategy, p.12](${href})`,
    );
    const intact = `See [Edge](${href}#13).`;
    expect(joinSplitCitationLinks(intact)).toBe(intact);
  });
});

describe("citation warmup", () => {
  it("starts from a citation path as soon as the answer contains it", () => {
    const fileId = "1cNsyB6IoH4rpHM6lKeRdGkgO0Vzvy1f4-RvkRJ_6NmA";
    const chunkId = `pipelines/productstrategycy26/stages/crawl/${fileId}.pdf#13`;
    const partial = `See [Edge Strategy, p.9](${chunkId}`;
    expect(citationTargetsInText(partial)).toEqual([
      { pipeline: "productstrategycy26", chunkId },
    ]);
    expect(citationTargetsInText("See [flag](./calculate_bookings_flag.md)")).toEqual([]);
  });

  it("starts from chunk ids in a search result before the answer exists", () => {
    const chunkId = "pipelines/productstrategycy27/stages/crawl/17dPGPaiFp-eBYOZVtosqtDa03opeliamHhafZVrRVxU.pdf#28";
    const content = `Found 1 chunks for query in pipeline "productstrategycy27":\n[{"chunk_id":"${chunkId}","chunk_text":"RHEL"}]`;
    expect(citationTargetsInChunkResult("get_chunks_for_embeddings", content)).toEqual([
      { pipeline: "productstrategycy27", chunkId },
    ]);
    expect(citationTargetsInChunkResult("execute_sql", "select 1")).toEqual([]);
  });
});

describe("documentReferences", () => {
  it("reads the file id from a document url", () => {
    expect(fileIdFromDocumentUrl("https://docs.google.com/document/d/doc-1")).toBe("doc-1");
    expect(fileIdFromDocumentUrl("https://example.com/doc")).toBeNull();
  });

  it("reads a bare file id and ignores a relative reference link", () => {
    const fileId = "1kay0XsAOelA-mJ1kIWvXC2KAAKonMurqxMNIZ0yL95s";
    expect(fileIdFromCitationHref(fileId)).toBe(fileId);
    expect(fileIdFromCitationHref(`https://docs.google.com/document/d/${fileId}`)).toBe(fileId);
    expect(fileIdFromCitationHref("./calculate_bookings_flag.md")).toBeNull();
    const cited = "1cNsyB6IoH4rpHM6lKeRdGkgO0Vzvy1f4-RvkRJ_6NmA";
    expect(fileIdFromCitationHref(`pipelines/productstrategycy26/stages/crawl/${cited}.pdf#13`)).toBe(cited);
    expect(isInAppHref("./calculate_bookings_flag.md")).toBe(true);
    expect(isInAppHref("https://docs.redhat.com/en/documentation/rhel")).toBe(false);
  });

  it("builds a reference from retrieved chunks and the answer title", () => {
    const messages = [
      {
        type: "ai",
        tool_calls: [{
          name: "get_chunks_for_embeddings",
          content: `Found 1 chunks for query in pipeline "analyzeproductrhel":\n${JSON.stringify([CHUNK])}\n`,
        }],
      },
      {
        type: "ai",
        content: "See [CY26 Product Strategy - RHEL](https://docs.google.com/document/d/doc-1).",
        tool_calls: [{
          name: "get_citation_image",
          args: { chunk_id: "pipelines/a.pdf#4" },
        }],
      },
    ];
    const references = documentReferences(messages);
    expect(references).toHaveLength(1);
    expect(references[0]?.title).toBe("CY26 Product Strategy - RHEL");
    expect(references[0]?.pages).toEqual([3]);
    expect(references[0]?.pipeline).toBe("analyzeproductrhel");
    expect(references[0]?.images).toEqual([]);
    expect(references[0]?.passages[0]?.text).toContain("Standardize on security.");
  });

  it("uses the answer label when the link target is only the file id", () => {
    const fileId = "1kay0XsAOelA-mJ1kIWvXC2KAAKonMurqxMNIZ0yL95s";
    const messages = [
      {
        type: "ai",
        content: `See [CY26 Product Strategy - RHEL](${fileId}).`,
        tool_calls: [{
          name: "get_chunks_for_embeddings",
          content: `Found 1 chunks for query in pipeline "analyzeproductrhel":\n${JSON.stringify([{
            ...CHUNK,
            file_id: fileId,
          }])}\n`,
        }],
      },
    ];
    expect(documentReferences(messages)[0]?.title).toBe("CY26 Product Strategy - RHEL");
  });

  it("keeps documents when the chunk list is cut off", () => {
    const fileId = "1gLzn3TWNpjj_cReT5kOXFfUjHdcGK5AP";
    const opened = "1RZg2uzP1WbxumFuRkceZcndgQDOsiSOb";
    const full = JSON.stringify([
      { file_id: fileId, chunk_text: "RHEL 10 considerations", chunk_id: "pipelines/a.pdf#1" },
      { file_id: opened, chunk_text: "upgrade notes" },
    ]);
    const cut = full.slice(0, full.indexOf("upgrade") + 4);
    const content = `Found 100 chunks for query in pipeline "aifrhel":\n${cut}\n\n[Result shortened from 90000 characters.]`;
    const messages = [{
      type: "ai",
      content: `See [Considerations](${fileId}) and [Upgrading](${opened}).`,
      tool_calls: [
        { name: "get_chunks_for_embeddings", content },
        { name: "get_processed_document", args: { pipeline_name: "aifrhel", file_id: opened } },
      ],
    }];
    const references = documentReferences(messages);
    expect(references.map((item) => item.fileId)).toEqual([fileId, opened]);
    expect(references.every((item) => item.pipeline === "aifrhel")).toBe(true);
    expect(references[0]?.title).toBe("Considerations");
  });

  it("keeps each cited chunk as its own page", () => {
    const edge = "1cNsyB6IoH4rpHM6lKeRdGkgO0Vzvy1f4-RvkRJ_6NmA";
    const rhel = "17dPGPaiFp-eBYOZVtosqtDa03opeliamHhafZVrRVxU";
    const edgeChunk = `pipelines/productstrategycy26/stages/crawl/${edge}.pdf#13`;
    const rhelChunk = `pipelines/productstrategycy27/stages/crawl/${rhel}.pdf#28`;
    const messages = [{
      type: "ai",
      content: `See [Edge Strategy, p.9](${edgeChunk}) and [RHEL Strategy, p.19](${rhelChunk}).`,
      tool_calls: [{
        name: "get_chunks_for_embeddings",
        content: `Found 2 chunks for query in pipeline "productstrategycy26":\n${JSON.stringify([
          { file_id: edge, chunk_id: edgeChunk, chunk_text: "Edge page", regions: [{ pageNo: 9 }] },
          { file_id: rhel, chunk_id: rhelChunk, chunk_text: "RHEL page", regions: [{ pageNo: 19 }] },
        ])}\n`,
      }],
    }];
    const pages = viewerPages(documentReferences(messages));
    expect(pages.map((page) => page.page)).toEqual([9, 19]);
    expect(pages.map((page) => page.chunkId)).toEqual([edgeChunk, rhelChunk]);
  });
});
