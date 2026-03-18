import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { MermaidBlock } from "./MermaidBlock";

type MdComponentProps = {
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

function extractTextContent(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (typeof node === "object" && "props" in node) {
    return extractTextContent((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export const mdComponents = {
  h1: ({ className, children, ...props }: MdComponentProps) => (
    <h1 className={cn("text-2xl font-bold mt-4 mb-2", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }: MdComponentProps) => (
    <h2 className={cn("text-xl font-bold mt-3 mb-2", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }: MdComponentProps) => (
    <h3 className={cn("text-lg font-bold mt-3 mb-1", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7", className)} {...props}>
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }: MdComponentProps) => (
    <Badge className="text-xs mx-0.5">
      <a
        className={cn("text-blue-400 hover:text-blue-300 text-xs", className)}
        href={href as string}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    </Badge>
  ),
  ul: ({ className, children, ...props }: MdComponentProps) => (
    <ul className={cn("list-disc pl-6 mb-3", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }: MdComponentProps) => (
    <ol className={cn("list-decimal pl-6 mb-3", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }: MdComponentProps) => (
    <li className={cn("mb-1", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }: MdComponentProps) => (
    <blockquote
      className={cn("border-l-4 border-neutral-600 pl-4 italic my-3 text-sm", className)}
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }: MdComponentProps) => (
    <code
      className={cn("bg-neutral-900 rounded px-1 py-0.5 font-mono text-xs", className)}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, ...props }: MdComponentProps) => {
    const child = Array.isArray(children) ? children[0] : children;
    if (child && typeof child === "object" && "props" in child) {
      const codeProps = (child as { props: { className?: string; children?: ReactNode } }).props;
      if (codeProps.className?.includes("language-mermaid")) {
        const code = extractTextContent(codeProps.children);
        return <MermaidBlock code={code} />;
      }
    }
    return (
      <pre
        className={cn("bg-neutral-900 p-3 rounded-lg overflow-x-auto font-mono text-xs my-3", className)}
        {...props}
      >
        {children}
      </pre>
    );
  },
  hr: ({ className, ...props }: MdComponentProps) => (
    <hr className={cn("border-neutral-600 my-4", className)} {...props} />
  ),
  table: ({ className, children, ...props }: MdComponentProps) => (
    <div className="my-3 overflow-x-auto max-w-full">
      <table className={cn("border-collapse w-full table-fixed", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ className, children, ...props }: MdComponentProps) => (
    <thead className={cn("bg-neutral-800", className)} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ className, children, ...props }: MdComponentProps) => (
    <tbody className={cn("", className)} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ className, children, ...props }: MdComponentProps) => (
    <tr className={cn("border-b border-neutral-700 even:bg-neutral-800 odd:bg-neutral-900", className)} {...props}>
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }: MdComponentProps) => (
    <th className={cn("border border-neutral-700 px-3 py-2 text-left font-bold bg-neutral-800", className)} {...props}>
      {children}
    </th>
  ),
  td: ({ className, children, ...props }: MdComponentProps) => (
    <td className={cn("border border-neutral-600 px-3 py-2 break-words", className)} {...props}>
      {children}
    </td>
  ),
  img: ({ className, ...props }: MdComponentProps) => (
    <img className={cn("w-full h-auto", className)} alt="" {...props} />
  ),
};
