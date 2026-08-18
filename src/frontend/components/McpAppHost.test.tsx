import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import configReducer from "../redux/slices/config";
import userSettingsReducer from "../redux/slices/userSettings";
import { ChatActionsProvider } from "../contexts/ChatActionsContext";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const appRendererSpy = vi.fn();
const teardownResourceSpy = vi.fn().mockResolvedValue({});

vi.mock("@mcp-ui/client", () => ({
  AppRenderer: React.forwardRef((props: Record<string, unknown>, ref) => {
    appRendererSpy(props);
    React.useImperativeHandle(ref, () => ({
      teardownResource: teardownResourceSpy,
      sendToolListChanged: vi.fn(),
      sendResourceListChanged: vi.fn(),
      sendPromptListChanged: vi.fn(),
    }));
    return (
      <div data-testid="mock-app-renderer">
        <iframe title="mcp-app-sandbox" />
      </div>
    );
  }),
}));

vi.mock("../services/mcp-apps-api", () => ({
  readMcpAppResource: vi.fn(),
  listMcpAppResources: vi.fn(),
  listMcpAppResourceTemplates: vi.fn(),
  listMcpAppTools: vi.fn(),
  callMcpAppTool: vi.fn(),
}));

import {
  callMcpAppTool,
  listMcpAppResources,
  listMcpAppResourceTemplates,
  listMcpAppTools,
  readMcpAppResource,
} from "../services/mcp-apps-api";
import { McpAppHost, McpAppHostFromToolCall } from "./McpAppHost";

const readMcpAppResourceMock = vi.mocked(readMcpAppResource);
const listMcpAppResourcesMock = vi.mocked(listMcpAppResources);
const listMcpAppResourceTemplatesMock = vi.mocked(listMcpAppResourceTemplates);
const listMcpAppToolsMock = vi.mocked(listMcpAppTools);
const callMcpAppToolMock = vi.mocked(callMcpAppTool);

function renderWithStore(
  ui: React.ReactElement,
  options?: {
    features?: { mcp_apps_enabled?: boolean } | null;
    chatActions?: {
      sendUserMessage: (text: string) => Promise<void>;
      setMcpModelContext: (update: unknown) => void;
    };
  },
) {
  const features = options?.features === undefined
    ? { mcp_apps_enabled: true }
    : options.features;
  const store = configureStore({
    reducer: {
      config: configReducer,
      userSettings: userSettingsReducer,
    },
    preloadedState: {
      config: {
        branding: null,
        features: features
          ? {
              debug_mode_default: false,
              auth_enabled: false,
              ...features,
            }
          : null,
        loading: false,
        error: null,
      },
    },
  });

  const tree = options?.chatActions ? (
    <ChatActionsProvider value={options.chatActions as never}>{ui}</ChatActionsProvider>
  ) : (
    ui
  );

  return render(<Provider store={store}>{tree}</Provider>);
}

const sampleApp = {
  server: "charts",
  resourceUri: "ui://charts/app.html",
  toolName: "show_chart",
  arguments: { topic: "sales" },
  result: { content: [{ type: "text", text: "ok" }], isError: false },
};

describe("McpAppHost", () => {
  beforeEach(() => {
    appRendererSpy.mockClear();
    teardownResourceSpy.mockClear();
    teardownResourceSpy.mockResolvedValue({});
    readMcpAppResourceMock.mockReset();
    listMcpAppResourcesMock.mockReset();
    listMcpAppResourcesMock.mockResolvedValue({ resources: [] });
    listMcpAppResourceTemplatesMock.mockReset();
    listMcpAppResourceTemplatesMock.mockResolvedValue({ resourceTemplates: [] });
    listMcpAppToolsMock.mockReset();
    listMcpAppToolsMock.mockResolvedValue({
      tools: [
        {
          name: "show_chart",
          inputSchema: {
            type: "object",
            properties: { topic: { type: "string" } },
          },
        },
      ],
    });
    callMcpAppToolMock.mockReset();
    readMcpAppResourceMock.mockResolvedValue({
      contents: [
        {
          uri: "ui://charts/app.html",
          mimeType: "text/html;profile=mcp-app",
          text: "<!DOCTYPE html><html></html>",
          _meta: {
            ui: {
              csp: {
                resourceDomains: ["https://unpkg.com"],
                frameDomains: ["https://example.com"],
              },
              permissions: {
                clipboardWrite: {},
              },
            },
          },
        },
      ],
    });
  });

  it("renders AppRenderer with sandbox CSP, permissions, and hostCapabilities.sandbox", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);

    expect(screen.getByTestId("mcp-app-host")).toBeInTheDocument();
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      toolName: string;
      toolResourceUri: string;
      sandbox: { url: URL; csp?: { frameDomains?: string[]; resourceDomains?: string[] } };
      hostInfo: { name: string; version: string };
      hostCapabilities: Record<string, unknown>;
      hostContext: {
        platform?: string;
        displayMode?: string;
        availableDisplayModes?: string[];
        containerDimensions?: { width?: number; maxWidth?: number; maxHeight?: number };
        toolInfo?: { tool?: { name?: string } };
        userAgent?: string;
      };
      onMessage: unknown;
      onLoggingMessage: unknown;
      onListResources: unknown;
      onFallbackRequest: unknown;
    };
    expect(props.toolName).toBe("show_chart");
    expect(props.toolResourceUri).toBe("ui://charts/app.html");
    expect(props.hostInfo).toEqual({ name: "Template UI", version: "0.1.0" });
    expect(props.sandbox.csp).toEqual({
      resourceDomains: ["https://unpkg.com"],
      frameDomains: ["https://example.com"],
      connectDomains: undefined,
      baseUriDomains: undefined,
    });
    expect(JSON.parse(props.sandbox.url.searchParams.get("permissions") || "")).toEqual({
      clipboardWrite: {},
    });
    expect(props.hostCapabilities).toMatchObject({
      downloadFile: {},
      serverResources: {},
      logging: {},
      message: { text: {} },
      updateModelContext: { text: {}, structuredContent: {} },
      sandbox: {
        csp: {
          resourceDomains: ["https://unpkg.com"],
          frameDomains: ["https://example.com"],
        },
        permissions: {
          clipboardWrite: {},
        },
      },
    });
    expect(typeof props.onMessage).toBe("function");
    expect(typeof props.onLoggingMessage).toBe("function");
    expect(typeof props.onListResources).toBe("function");
    expect(typeof props.onFallbackRequest).toBe("function");
    expect(props.hostContext).toMatchObject({
      platform: "web",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      toolInfo: { tool: { name: "show_chart" } },
      userAgent: "Template UI/0.1.0",
    });
    expect(props.hostContext.containerDimensions).toEqual({
      maxWidth: 4096,
      maxHeight: 1200,
    });
  });

  it("applies size-changed height and keeps host/iframe width fluid", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onSizeChanged: (params: { height?: number; width?: number }) => void;
    };
    const frame = screen.getByTestId("mock-app-renderer").parentElement;
    const iframe = screen.getByTitle("mcp-app-sandbox");
    expect(frame).toBeTruthy();

    props.onSizeChanged({ width: 640, height: 500 });
    // AppFrame sets iframe px width after invoking onSizeChanged (same turn).
    iframe.style.width = "640px";
    await waitFor(() => {
      expect(frame).toHaveStyle({ width: "100%", height: "500px" });
      expect(iframe).toHaveStyle({ width: "100%" });
    });

    props.onSizeChanged({ width: 99999, height: 99999 });
    iframe.style.width = "99999px";
    await waitFor(() => {
      expect(frame).toHaveStyle({ width: "100%", height: "1200px" });
      expect(iframe).toHaveStyle({ width: "100%" });
    });
  });

  it("fails closed when resources/read MIME is not mcp-app HTML", async () => {
    readMcpAppResourceMock.mockResolvedValue({
      contents: [
        {
          uri: "ui://charts/app.html",
          mimeType: "text/html",
          text: "<html></html>",
        },
      ],
    });
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/MIME type/i),
    );
    expect(screen.queryByTestId("mock-app-renderer")).not.toBeInTheDocument();
  });

  it("fails closed when resource prefetch throws", async () => {
    readMcpAppResourceMock.mockRejectedValue(new Error("network down"));
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/network down/i),
    );
    expect(screen.queryByTestId("mock-app-renderer")).not.toBeInTheDocument();
  });

  it("onReadResource rejects invalid ui:// HTML", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onReadResource: (params: { uri: string }) => Promise<unknown>;
    };

    readMcpAppResourceMock.mockResolvedValue({
      contents: [
        {
          uri: "ui://charts/app.html",
          mimeType: "text/html;profile=mcp-app",
          text: "<html><body>no doctype</body></html>",
        },
      ],
    });

    await expect(
      props.onReadResource({ uri: "ui://charts/app.html" }),
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringMatching(/HTML5/i),
    });
  });

  it("onLoggingMessage writes View logs to the console", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onLoggingMessage: (params: {
        level?: string;
        logger?: string;
        data?: unknown;
      }) => void;
    };
    props.onLoggingMessage({ level: "info", logger: "demo", data: "hello" });
    expect(info).toHaveBeenCalledWith("[MCP App:charts:demo]", "hello");
    info.mockRestore();
  });

  it("sends host teardown on unmount before the iframe is destroyed", async () => {
    const { unmount } = renderWithStore(
      <McpAppHost toolName="show_chart" mcpApp={sampleApp} />,
    );
    await waitFor(() => expect(screen.getByTestId("mock-app-renderer")).toBeInTheDocument());
    unmount();
    expect(teardownResourceSpy).toHaveBeenCalled();
  });

  it("uses a singleton hostInfo across mounts (AppBridge must not see new identity)", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const firstHostInfo = (
      appRendererSpy.mock.calls[0][0] as { hostInfo: object }
    ).hostInfo;

    renderWithStore(
      <McpAppHost
        toolName="show_chart"
        mcpApp={{ ...sampleApp, arguments: { topic: "sales" } }}
      />,
    );
    await waitFor(() => expect(appRendererSpy.mock.calls.length).toBeGreaterThan(1));
    const secondHostInfo = (
      appRendererSpy.mock.calls[appRendererSpy.mock.calls.length - 1][0] as {
        hostInfo: object;
      }
    ).hostInfo;
    expect(secondHostInfo).toBe(firstHostInfo);
  });

  it("onMessage sends extracted text via ChatActions", async () => {
    const sendUserMessage = vi.fn().mockResolvedValue(undefined);
    const setMcpModelContext = vi.fn();
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />, {
      chatActions: { sendUserMessage, setMcpModelContext },
    });

    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onMessage: (params: { role: string; content: unknown[] }) => Promise<{ isError?: boolean }>;
    };
    const result = await props.onMessage({
      role: "user",
      content: [{ type: "text", text: "Apply filter" }],
    });

    expect(result).toEqual({});
    expect(sendUserMessage).toHaveBeenCalledWith("Apply filter");
  });

  it("onMessage returns isError when ChatActions are missing", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onMessage: (params: { role: string; content: unknown[] }) => Promise<{ isError?: boolean }>;
    };
    await expect(
      props.onMessage({ role: "user", content: [{ type: "text", text: "Hi" }] }),
    ).resolves.toEqual({ isError: true });
  });

  it("onFallbackRequest stores ui/update-model-context", async () => {
    const sendUserMessage = vi.fn();
    const setMcpModelContext = vi.fn();
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />, {
      chatActions: { sendUserMessage, setMcpModelContext },
    });

    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: {
        jsonrpc: "2.0";
        method: string;
        params?: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
    };

    await expect(
      props.onFallbackRequest({
        jsonrpc: "2.0",
        method: "ui/update-model-context",
        params: {
          content: [{ type: "text", text: "Row 3 selected" }],
          structuredContent: { row: 3 },
        },
      }),
    ).resolves.toEqual({});

    expect(setMcpModelContext).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Row 3 selected" }],
      structuredContent: { row: 3 },
    });
  });

  it("onListResources proxies via listMcpAppResources", async () => {
    listMcpAppResourcesMock.mockResolvedValue({
      resources: [{ uri: "showcase://sample.json", name: "sample" }],
      nextCursor: "c2",
    });
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onListResources: (params?: { cursor?: string }) => Promise<{
        resources: unknown[];
        nextCursor?: string;
      }>;
    };
    await expect(props.onListResources(undefined)).resolves.toEqual({
      resources: [{ uri: "showcase://sample.json", name: "sample" }],
      nextCursor: "c2",
    });
    expect(listMcpAppResourcesMock).toHaveBeenCalledWith("charts", undefined);

    await expect(props.onListResources({ cursor: "c1" })).resolves.toEqual({
      resources: [{ uri: "showcase://sample.json", name: "sample" }],
      nextCursor: "c2",
    });
    expect(listMcpAppResourcesMock).toHaveBeenCalledWith("charts", "c1");
  });

  it("onListResourceTemplates proxies via listMcpAppResourceTemplates", async () => {
    listMcpAppResourceTemplatesMock.mockResolvedValue({
      resourceTemplates: [{ uriTemplate: "showcase://{id}", name: "sample" }],
      nextCursor: "t2",
    });
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onListResourceTemplates: (params?: { cursor?: string }) => Promise<{
        resourceTemplates: unknown[];
        nextCursor?: string;
      }>;
    };
    await expect(props.onListResourceTemplates(undefined)).resolves.toEqual({
      resourceTemplates: [{ uriTemplate: "showcase://{id}", name: "sample" }],
      nextCursor: "t2",
    });
    expect(listMcpAppResourceTemplatesMock).toHaveBeenCalledWith("charts", undefined);
  });

  it("onOpenLink opens https URLs after user confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onOpenLink: (params: { url: string }) => Promise<{ isError?: boolean }>;
    };

    await expect(props.onOpenLink({ url: "https://example.com/path" })).resolves.toEqual({});
    expect(confirm).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      "https://example.com/path",
      "_blank",
      "noopener,noreferrer",
    );

    confirm.mockRestore();
    open.mockRestore();
  });

  it("onOpenLink returns isError when user denies confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onOpenLink: (params: { url: string }) => Promise<{ isError?: boolean }>;
    };

    await expect(props.onOpenLink({ url: "https://example.com" })).resolves.toEqual({
      isError: true,
    });
    expect(open).not.toHaveBeenCalled();

    confirm.mockRestore();
    open.mockRestore();
  });

  it("onOpenLink rejects malformed absolute URLs without using the page as base", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onOpenLink: (params: { url: string }) => Promise<{ isError?: boolean }>;
    };

    await expect(
      props.onOpenLink({ url: "not a valid url ://???" }),
    ).resolves.toEqual({ isError: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    confirm.mockRestore();
    open.mockRestore();
  });

  it("omits toolResult and sets toolCancelled when result is missing and cancelled", async () => {
    const { result: _omit, ...withoutResult } = sampleApp;
    renderWithStore(
      <McpAppHost
        toolName="show_chart"
        mcpApp={withoutResult as typeof sampleApp}
        toolCancelled
      />,
    );
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      toolResult?: unknown;
      toolCancelled?: boolean;
      html?: string;
    };
    expect(props.toolResult).toBeUndefined();
    expect(props.toolCancelled).toBe(true);
    expect(props.html).toBe("<!DOCTYPE html><html></html>");
  });

  it("loads inputSchema from tools/list into hostContext.toolInfo", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    await waitFor(() => {
      const props = appRendererSpy.mock.calls.at(-1)?.[0] as {
        hostContext: { toolInfo?: { tool?: { inputSchema?: Record<string, unknown> } } };
      };
      expect(props.hostContext.toolInfo?.tool?.inputSchema).toEqual({
        type: "object",
        properties: { topic: { type: "string" } },
      });
    });
  });

  it("onCallTool omits null structuredContent", async () => {
    callMcpAppToolMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      structuredContent: null as unknown as Record<string, unknown>,
      isError: false,
    });
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onCallTool: (params: {
        name: string;
        arguments?: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
    };
    const result = await props.onCallTool({ name: "refresh", arguments: {} });
    expect(result).toEqual({
      content: [{ type: "text", text: "ok" }],
      isError: false,
    });
    expect("structuredContent" in result).toBe(false);
  });

  it("omits null structuredContent so CallToolResultSchema accepts toolResult", async () => {
    renderWithStore(
      <McpAppHost
        toolName="show_chart"
        mcpApp={{
          ...sampleApp,
          result: {
            content: [{ type: "text", text: "ok" }],
            structuredContent: null as unknown as Record<string, unknown>,
            isError: false,
          },
        }}
      />,
    );
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      toolResult: Record<string, unknown>;
    };
    expect(props.toolResult).toEqual({
      content: [{ type: "text", text: "ok" }],
      isError: false,
    });
    expect("structuredContent" in props.toolResult).toBe(false);
  });

  it("onFallbackRequest handles ui/download-file for embedded text", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: {
        jsonrpc: "2.0";
        method: string;
        params?: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
    };

    await expect(
      props.onFallbackRequest({
        jsonrpc: "2.0",
        method: "ui/download-file",
        params: {
          contents: [
            {
              type: "resource",
              resource: {
                uri: "showcase://sample.json",
                mimeType: "application/json",
                text: '{"ok":true}',
              },
            },
          ],
        },
      }),
    ).resolves.toEqual({});

    expect(confirm).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalled();
    confirm.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("onFallbackRequest denies ui/download-file when user cancels", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const createObjectURL = vi.spyOn(URL, "createObjectURL");

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: {
        jsonrpc: "2.0";
        method: string;
        params?: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
    };

    const result = await props.onFallbackRequest({
      jsonrpc: "2.0",
      method: "ui/download-file",
      params: {
        contents: [
          {
            type: "resource",
            resource: {
              uri: "showcase://sample.json",
              mimeType: "application/json",
              text: '{"ok":true}',
            },
          },
        ],
      },
    });
    expect(result).toEqual({ isError: true });
    expect(createObjectURL).not.toHaveBeenCalled();

    confirm.mockRestore();
    createObjectURL.mockRestore();
  });

  it("onFallbackRequest downloads resource_link via resources/read", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: {
        jsonrpc: "2.0";
        method: string;
        params?: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
    };

    readMcpAppResourceMock.mockResolvedValueOnce({
      contents: [
        {
          uri: "showcase://linked.json",
          mimeType: "application/json",
          text: '{"from":"link"}',
        },
      ],
    });

    await expect(
      props.onFallbackRequest({
        jsonrpc: "2.0",
        method: "ui/download-file",
        params: {
          contents: [
            { type: "resource_link", uri: "showcase://linked.json", name: "linked.json" },
          ],
        },
      }),
    ).resolves.toEqual({});

    expect(readMcpAppResourceMock).toHaveBeenCalledWith("charts", "showcase://linked.json");
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();

    confirm.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("onFallbackRequest echoes inline for ui/request-display-mode", async () => {
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);

    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: {
        jsonrpc: "2.0";
        method: string;
        params?: { mode?: string };
      }) => Promise<unknown>;
    };

    await expect(
      props.onFallbackRequest({
        jsonrpc: "2.0",
        method: "ui/request-display-mode",
        params: { mode: "fullscreen" },
      }),
    ).resolves.toEqual({ mode: "inline" });
  });

  it("onFallbackRequest proxies tools/list to the agent", async () => {
    listMcpAppToolsMock.mockResolvedValue({
      tools: [{ name: "lab_refresh", inputSchema: { type: "object" } }],
      nextCursor: "page-2",
    });
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: {
        jsonrpc: "2.0";
        method: string;
        params?: { cursor?: string };
      }) => Promise<Record<string, unknown>>;
    };

    await expect(
      props.onFallbackRequest({
        jsonrpc: "2.0",
        method: "tools/list",
        params: { cursor: "page-1" },
      }),
    ).resolves.toEqual({
      tools: [{ name: "lab_refresh", inputSchema: { type: "object" } }],
      nextCursor: "page-2",
    });
    expect(listMcpAppToolsMock).toHaveBeenCalledWith("charts", "page-1");
  });

  it("falls back to resources/list for CSP when read omits _meta.ui", async () => {
    readMcpAppResourceMock.mockResolvedValue({
      contents: [
        {
          uri: "ui://charts/app.html",
          mimeType: "text/html;profile=mcp-app",
          text: "<!DOCTYPE html><html></html>",
        },
      ],
    });
    listMcpAppResourcesMock.mockResolvedValue({
      resources: [
        {
          uri: "ui://charts/app.html",
          _meta: {
            ui: {
              csp: {
                resourceDomains: ["https://cdn.example"],
                frameDomains: ["https://player.example"],
              },
              permissions: { camera: {} },
            },
          },
        },
      ],
    });

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls.at(-1)?.[0] as {
      sandbox: { csp?: { resourceDomains?: string[]; frameDomains?: string[] }; url: URL };
      hostCapabilities: { sandbox?: { permissions?: Record<string, unknown> } };
    };
    expect(listMcpAppResourcesMock).toHaveBeenCalled();
    expect(props.sandbox.csp).toEqual({
      resourceDomains: ["https://cdn.example"],
      frameDomains: ["https://player.example"],
      connectDomains: undefined,
      baseUriDomains: undefined,
    });
    expect(JSON.parse(props.sandbox.url.searchParams.get("permissions") || "")).toEqual({
      camera: {},
    });
  });

  it("paginates resources/list for CSP until the matching uri is found", async () => {
    readMcpAppResourceMock.mockResolvedValue({
      contents: [
        {
          uri: "ui://charts/app.html",
          mimeType: "text/html;profile=mcp-app",
          text: "<!DOCTYPE html><html></html>",
        },
      ],
    });
    listMcpAppResourcesMock
      .mockResolvedValueOnce({
        resources: [{ uri: "ui://other/app.html" }],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        resources: [
          {
            uri: "ui://charts/app.html",
            _meta: {
              ui: {
                csp: { resourceDomains: ["https://page2.cdn"] },
                permissions: { microphone: {} },
              },
            },
          },
        ],
      });

    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />);
    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls.at(-1)?.[0] as {
      sandbox: { csp?: { resourceDomains?: string[] }; url: URL };
    };
    expect(listMcpAppResourcesMock).toHaveBeenNthCalledWith(1, "charts", undefined);
    expect(listMcpAppResourcesMock).toHaveBeenNthCalledWith(2, "charts", "page-2");
    expect(props.sandbox.csp?.resourceDomains).toEqual(["https://page2.cdn"]);
    expect(JSON.parse(props.sandbox.url.searchParams.get("permissions") || "")).toEqual({
      microphone: {},
    });
  });

  it("onFallbackRequest throws MethodNotFound for unknown methods", async () => {
    const sendUserMessage = vi.fn();
    const setMcpModelContext = vi.fn();
    renderWithStore(<McpAppHost toolName="show_chart" mcpApp={sampleApp} />, {
      chatActions: { sendUserMessage, setMcpModelContext },
    });

    await waitFor(() => expect(appRendererSpy).toHaveBeenCalled());
    const props = appRendererSpy.mock.calls[0][0] as {
      onFallbackRequest: (request: { jsonrpc: "2.0"; method: string }) => Promise<unknown>;
    };

    try {
      await props.onFallbackRequest({ jsonrpc: "2.0", method: "x/unknown" });
      expect.unreachable("expected MethodNotFound");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(ErrorCode.MethodNotFound);
    }
  });

  it("McpAppHostFromToolCall returns null when mcp_apps disabled", () => {
    const { container } = renderWithStore(
      <McpAppHostFromToolCall
        toolName="show_chart"
        mcpAppRaw={{
          server: "charts",
          resourceUri: "ui://charts/app.html",
        }}
      />,
      { features: { mcp_apps_enabled: false } },
    );
    expect(container).toBeEmptyDOMElement();
    expect(appRendererSpy).not.toHaveBeenCalled();
  });

  it("McpAppHostFromToolCall fails closed when features are unavailable", () => {
    const { container } = renderWithStore(
      <McpAppHostFromToolCall
        toolName="show_chart"
        mcpAppRaw={{
          server: "charts",
          resourceUri: "ui://charts/app.html",
        }}
      />,
      { features: null },
    );
    expect(container).toBeEmptyDOMElement();
    expect(appRendererSpy).not.toHaveBeenCalled();
  });

  it("McpAppHostFromToolCall returns null for invalid mcpApp", async () => {
    const { container } = renderWithStore(
      <McpAppHostFromToolCall toolName="show_chart" mcpAppRaw={{ server: "charts" }} />,
    );
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(appRendererSpy).not.toHaveBeenCalled());
  });
});
