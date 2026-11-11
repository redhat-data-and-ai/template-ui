import { createContext } from "react";

export const DocumentOpenContext = createContext<((fileId: string, href?: string) => void) | null>(null);
