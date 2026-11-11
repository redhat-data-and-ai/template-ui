import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message } from "@langchain/langgraph-sdk";
import { callMcpAppTool } from "../services/mcp-apps-api";
import { AIMessageRenderer } from "./ChatMessagesView";
import { DocumentChrome } from "./DocumentReferences";

vi.mock("../services/mcp-apps-api", () => ({
  callMcpAppTool: vi.fn(),
}));

const doc = "https://docs.google.com/document/d/doc-1";

describe("document open", () => {
  it("opens the document in the page viewer", async () => {
    vi.mocked(callMcpAppTool).mockImplementation(async (_mcp, name) => {
      if (name === "get_processed_document") {
        return {
          content: [{
            type: "text",
            text: `Processed document:\n${JSON.stringify({ markdown_content: "## Principles\n\nStandardize on RHEL." })}`,
          }],
        };
      }
      return { content: [] };
    });
    const user = userEvent.setup();
    const message = {
      type: "ai",
      id: "m1",
      content: `See [CY26 RHEL](${doc}).`,
      tool_calls: [{
        name: "get_chunks_for_embeddings",
        content: `Found 1 chunks for query in pipeline "analyzeproductrhel":\n${JSON.stringify([{
          file_id: "doc-1",
          chunk_text: "## Principles\nStandardize on RHEL.",
        }])}\n`,
      }],
    } as Message;
    render(
      <DocumentChrome messages={[message]}>
        <AIMessageRenderer message={message} />
      </DocumentChrome>,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    const rail = screen.getByRole("complementary", { name: "References" });
    await user.click(within(rail).getByRole("button", { name: /CY26 RHEL/ }));
    expect(document.querySelector("iframe")).toBeNull();
    expect(await screen.findByRole("dialog", { name: "CY26 RHEL" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Principles" })).toBeInTheDocument();
    expect(screen.getByText("Standardize on RHEL.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close document" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the viewer from a bare file id and does not follow a relative reference", async () => {
    const fileId = "1kay0XsAOelA-mJ1kIWvXC2KAAKonMurqxMNIZ0yL95s";
    const user = userEvent.setup();
    const message = {
      type: "ai",
      id: "m-bare",
      content: `See [CY26 RHEL](${fileId}). The [\`flag\` reference](./calculate_bookings_flag.md) stays here.`,
      tool_calls: [{
        name: "get_chunks_for_embeddings",
        content: `Found 1 chunks for query in pipeline "analyzeproductrhel":\n${JSON.stringify([{
          file_id: fileId,
          chunk_text: "Standardize on RHEL.",
        }])}\n`,
      }],
    } as Message;
    render(
      <DocumentChrome messages={[message]}>
        <AIMessageRenderer message={message} />
      </DocumentChrome>,
    );
    expect(screen.queryByRole("link", { name: /reference/ })).toBeNull();
    expect(screen.getByText(/reference/)).toBeInTheDocument();
    const citations = screen.getAllByRole("button", { name: "CY26 RHEL" });
    expect(citations[0]).toHaveClass("citation-link");
    await user.click(citations[0]);
    expect(await screen.findByRole("dialog", { name: "CY26 RHEL" })).toBeInTheDocument();
  });

  it("renders the citation page from the returned image", async () => {
    vi.mocked(callMcpAppTool).mockImplementation(async (_mcp, name) => {
      if (name === "get_citation_image") {
        return { content: [{ type: "image", data: "abc", mimeType: "image/png" }] };
      }
      return { content: [] };
    });
    const user = userEvent.setup();
    const message = {
      type: "ai",
      id: "m2",
      content: `See [CY26 RHEL](${doc}).`,
      tool_calls: [{
        name: "get_chunks_for_embeddings",
        content: `Found 1 chunks for query in pipeline "productstrategycy26":\n${JSON.stringify([{
          file_id: "doc-1",
          chunk_id: "pipelines/doc.pdf#1",
          chunk_text: "page text",
          regions: [{ pageNo: 1, bbox: [0, 0, 1, 1], image: "page.png" }],
        }])}\n`,
      }],
    } as Message;
    render(
      <DocumentChrome messages={[message]}>
        <div />
      </DocumentChrome>,
    );
    await user.click(within(screen.getByRole("complementary", { name: "References" })).getByRole("button", { name: /CY26 RHEL/ }));
    const image = await screen.findByRole("img", { name: "CY26 RHEL page" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,abc");
    expect(screen.queryByText("page text")).toBeNull();
  });

  it("opens a pipeline citation and moves to the next referenced page", async () => {
    vi.mocked(callMcpAppTool).mockResolvedValue({ content: [] });
    const edge = "1cNsyB6IoH4rpHM6lKeRdGkgO0Vzvy1f4-RvkRJ_6NmA";
    const rhel = "17dPGPaiFp-eBYOZVtosqtDa03opeliamHhafZVrRVxU";
    const edgeChunk = `pipelines/productstrategycy26/stages/crawl/${edge}.pdf#13`;
    const rhelChunk = `pipelines/productstrategycy27/stages/crawl/${rhel}.pdf#28`;
    const user = userEvent.setup();
    const message = {
      type: "ai",
      id: "m-pages",
      content: `See [Edge Strategy, p.9](${edgeChunk}) and [RHEL Strategy, p.19](${rhelChunk}).`,
      tool_calls: [{
        name: "get_chunks_for_embeddings",
        content: `Found 2 chunks for query in pipeline "productstrategycy26":\n${JSON.stringify([
          { file_id: edge, chunk_id: edgeChunk, chunk_text: "Edge page nine", regions: [{ pageNo: 9 }] },
          { file_id: rhel, chunk_id: rhelChunk, chunk_text: "RHEL page nineteen", regions: [{ pageNo: 19 }] },
        ])}\n`,
      }],
    } as Message;
    render(
      <DocumentChrome messages={[message]}>
        <AIMessageRenderer message={message} />
      </DocumentChrome>,
    );
    await user.click(screen.getByRole("button", { name: "Edge Strategy, p.9" }));
    expect(await screen.findByRole("dialog", { name: "Edge Strategy, p.9" })).toBeInTheDocument();
    expect(screen.getByText("Edge page nine")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("dialog", { name: "RHEL Strategy, p.19" })).toBeInTheDocument();
    expect(screen.getByText("RHEL page nineteen")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Edge page nine")).toBeInTheDocument();
  });
});
