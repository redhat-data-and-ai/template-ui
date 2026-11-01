import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputForm } from "./InputForm";
import { renderWithProviders } from "../test-utils/render";
import { HomePage } from "../pages/HomePage";
import {
  activeSlashQuery,
  applySlashSelection,
  filterSubagents,
  parseSubagentCatalog,
  resolveRequestedSubagents,
  slashTokens,
  messageWithSubagentMentions,
} from "./slash-subagents";

const catalog = {
  subagents: [
    { name: "analyst", description: "Calculates BMI." },
    { name: "publisher", description: "Sends the report." },
    { name: "not a name", description: "skipped" },
  ],
};

function mockCatalog() {
  const fetchMock = vi.fn().mockImplementation(
    () => Promise.resolve(new Response(JSON.stringify(catalog), {
      status: 200,
      headers: { "content-type": "application/json" },
    })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("slash token helpers", () => {
  it("reads the slash token at the caret and ignores slashes inside words", () => {
    expect(activeSlashQuery("/ana", 4)).toEqual({ start: 0, query: "ana" });
    expect(activeSlashQuery("see /pub", 8)).toEqual({ start: 4, query: "pub" });
    expect(activeSlashQuery("5/2", 3)).toBeNull();
    expect(activeSlashQuery("hello", 5)).toBeNull();
  });

  it("filters by the typed prefix and inserts the chosen name", () => {
    const items = [
      { name: "analyst", description: "Calculates BMI." },
      { name: "publisher", description: "Sends the report." },
    ];
    expect(filterSubagents(items, "pub").map((item) => item.name)).toEqual(["publisher"]);
    expect(applySlashSelection("/pub", 0, "publisher")).toEqual({
      value: "/publisher ",
      caret: 11,
    });
    expect(applySlashSelection("hello /pub world", 6, "publisher").value).toBe("hello /publisher world");
  });

  it("keeps only real subagent names from the catalog", () => {
    expect(parseSubagentCatalog(catalog)).toEqual([
      { name: "analyst", description: "Calculates BMI." },
      { name: "publisher", description: "Sends the report." },
    ]);
  });

  it("reads every finished slash name in order", () => {
    expect(slashTokens("/analyst I am 180 cm")).toEqual(["analyst"]);
    expect(slashTokens("/analyst /publisher compare them")).toEqual(["analyst", "publisher"]);
    expect(slashTokens("/analyst /analyst /publisher")).toEqual(["analyst", "publisher"]);
    expect(slashTokens("please /publisher the report")).toEqual(["publisher"]);
    expect(slashTokens("see /docs")).toEqual(["docs"]);
    expect(slashTokens("hello")).toEqual([]);
    expect(slashTokens("5/2")).toEqual([]);
  });
});

describe("resolveRequestedSubagents", () => {
  it("returns every tagged name that is on the live list", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify(catalog), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveRequestedSubagents("/analyst /publisher compare them")).resolves.toEqual([
      "analyst",
      "publisher",
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/config/subagents", { cache: "no-store" });

    await expect(resolveRequestedSubagents("/analyst /docs for details")).resolves.toEqual(["analyst"]);
    await expect(resolveRequestedSubagents("no slash here")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the message without subagents when the list cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(resolveRequestedSubagents("/analyst /publisher hi")).resolves.toEqual([]);
  });
});

describe("messageWithSubagentMentions", () => {
  it("stores the send-time names on the latest human message", () => {
    const messages = [
      { type: "ai", content: "hello" },
      { type: "human", content: "/analyst /publisher compare", additional_kwargs: { keep: true } },
    ];

    const next = messageWithSubagentMentions(messages, ["analyst", "publisher"]);

    expect(next[1].additional_kwargs).toEqual({
      keep: true,
      subagent_mentions: ["analyst", "publisher"],
    });
    expect(messages[1].additional_kwargs).toEqual({ keep: true });
    expect(messageWithSubagentMentions(messages, [])).toBe(messages);
  });
});

describe("subagent slash menu", () => {
  it("fetches a fresh list when / opens the menu and filters without fetching again", async () => {
    const fetchMock = mockCatalog();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);

    await user.type(screen.getByRole("textbox", { name: /type a message/i }), "/");

    expect(await screen.findByRole("option", { name: /\/analyst/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\/publisher/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/config/subagents", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });

    await user.type(screen.getByRole("textbox", { name: /type a message/i }), "pub");

    expect(screen.getByRole("option", { name: /\/publisher/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /\/analyst/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the short description until the subagent is hovered", async () => {
    mockCatalog();
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);

    await user.type(screen.getByRole("textbox", { name: /type a message/i }), "/");
    const analyst = await screen.findByRole("option", { name: /\/analyst/i });
    const description = analyst.querySelector("span.text-xs");

    expect(description).toHaveTextContent("Calculates BMI.");
    expect(description).toHaveClass("truncate");
    expect(screen.queryByRole("region", { name: "Subagent description" })).not.toBeInTheDocument();

    await user.hover(analyst);

    const box = screen.getByRole("region", { name: "Subagent description" });
    expect(box).toHaveTextContent("Calculates BMI.");
    expect(description).toHaveClass("truncate");

    await user.hover(screen.getByRole("textbox", { name: /type a message/i }));
    expect(screen.queryByRole("region", { name: "Subagent description" })).not.toBeInTheDocument();
  });

  it("inserts the highlighted subagent on Enter and does not send", async () => {
    mockCatalog();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const textbox = screen.getByRole("textbox", { name: /type a message/i });

    await user.type(textbox, "/");
    await screen.findByRole("option", { name: /\/analyst/i });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(textbox).toHaveValue("/publisher ");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  async function placeCaretInsideCompletedName(user: ReturnType<typeof userEvent.setup>) {
    const textbox = screen.getByRole("textbox", { name: /type a message/i });
    await user.type(textbox, "/");
    await user.click(await screen.findByRole("option", { name: /\/analyst/i }));
    expect(textbox).toHaveValue("/analyst ");
    textbox.focus();
    textbox.setSelectionRange(8, 8);
    fireEvent.select(textbox);
    expect(await screen.findByRole("option", { name: /\/analyst/i })).toBeInTheDocument();
    return textbox;
  }

  it("moves past an already completed name on Enter and keeps the menu closed", async () => {
    mockCatalog();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const textbox = await placeCaretInsideCompletedName(user);

    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("/analyst ");
    expect(textbox.selectionStart).toBe("/analyst ".length);
    expect(screen.queryByRole("listbox", { name: "Subagents" })).not.toBeInTheDocument();
  });

  it("moves past an already completed name on Tab and keeps the menu closed", async () => {
    mockCatalog();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const textbox = await placeCaretInsideCompletedName(user);

    await user.keyboard("{Tab}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("/analyst ");
    expect(textbox.selectionStart).toBe("/analyst ".length);
    expect(screen.queryByRole("listbox", { name: "Subagents" })).not.toBeInTheDocument();
  });

  it("inserts a subagent when its row is clicked", async () => {
    mockCatalog();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InputForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    const textbox = screen.getByRole("textbox", { name: /type a message/i });

    await user.type(textbox, "/");
    await user.click(await screen.findByRole("option", { name: /\/publisher/i }));

    expect(textbox).toHaveValue("/publisher ");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fetches again the next time / opens the menu", async () => {
    const fetchMock = mockCatalog();
    const user = userEvent.setup();
    render(<InputForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    const textbox = screen.getByRole("textbox", { name: /type a message/i });

    await user.type(textbox, "/");
    await screen.findByRole("option", { name: /\/analyst/i });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Subagents" })).not.toBeInTheDocument();

    await user.clear(textbox);
    await user.type(textbox, "/");

    expect(await screen.findByRole("option", { name: /\/analyst/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens the same menu on the home page", async () => {
    mockCatalog();
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    await user.type(screen.getByRole("textbox", { name: /enter a prompt/i }), "/");

    expect(await screen.findByRole("option", { name: /\/analyst/i })).toBeInTheDocument();
  });
});
