import { useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#6d28d9",
    primaryTextColor: "#e5e5e5",
    primaryBorderColor: "#7c3aed",
    lineColor: "#a78bfa",
    secondaryColor: "#1e1b4b",
    tertiaryColor: "#171717",
    background: "#171717",
    mainBkg: "#262626",
    nodeBorder: "#7c3aed",
    clusterBkg: "#1c1917",
    titleColor: "#e5e5e5",
    edgeLabelBackground: "#262626",
    pieSectionTextColor: "#e5e5e5",
    pieStrokeColor: "#404040",
    pie1: "#6d28d9",
    pie2: "#2563eb",
    pie3: "#059669",
    pie4: "#d97706",
    pie5: "#dc2626",
    pie6: "#0891b2",
    pie7: "#7c3aed",
    pie8: "#db2777",
  },
});

let idCounter = 0;

function sanitizeMermaid(raw: string): string {
  let code = raw;

  if (/xychart-beta/i.test(code)) {
    code = code.replaceAll(/\bbar\s+series\b/g, "bar");
    code = code.replaceAll(/\bline\s+series\b/g, "line");
    code = code.replaceAll(
      /x-axis\s+"([^"]*?)"\s*\{[^}]*categories\s*\[([^\]]*)\][^}]*\}/gs,
      (_m, title, cats) => `x-axis "${title}" [${cats.trim()}]`,
    );
    code = code.replaceAll(
      /x-axis\s*\{[^}]*categories\s*\[([^\]]*)\][^}]*\}/gs,
      (_m, cats) => `x-axis [${cats.trim()}]`,
    );
    code = code.replaceAll(
      /y-axis\s+"([^"]*?)"\s*\{[^}]*min\s+(\d+)[^}]*max\s+(\d+)[^}]*\}/gs,
      (_m, title, min, max) => `y-axis "${title}" ${min} --> ${max}`,
    );
    code = code.replaceAll(
      /(?:bar|line)\s*\{[^}]*data\s*\[([^\]]*)\][^}]*\}/gs,
      (_m, data) => `bar [${data.trim()}]`,
    );
    code = code.replaceAll(
      /\bbar\s+"[^"]*"\s*\{[^}]*data\s*\[([^\]]*)\][^}]*\}/gs,
      (_m, data) => `bar [${data.trim()}]`,
    );
  }

  return code.trim();
}

interface MermaidBlockProps {
  readonly code: string;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  const sanitized = useMemo(() => sanitizeMermaid(code), [code]);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++idCounter}`;

    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(id, sanitized);
        if (!cancelled) {
          const clean = DOMPurify.sanitize(rendered, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ["foreignObject"],
          });
          setSvg(clean);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setSvg("");
        }
        document.getElementById(id)?.remove();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sanitized]);

  if (error) {
    return (
      <pre className="bg-neutral-900 p-3 rounded-lg overflow-x-auto font-mono text-xs my-3 text-red-400">
        {code}
      </pre>
    );
  }

  if (!svg) return null;

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto max-w-full [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
