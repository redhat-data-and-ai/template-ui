import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
}
