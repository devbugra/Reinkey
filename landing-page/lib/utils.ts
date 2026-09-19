import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Koşullu sınıfları birleştirir ve çakışan Tailwind utility'lerini teker. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
