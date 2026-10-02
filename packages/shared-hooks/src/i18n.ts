type SharedTranslator = (key: string, fallback: string) => string;

let translator: SharedTranslator | null = null;

export function setSharedTranslator(next: SharedTranslator | null): void {
  translator = next;
}

export function sharedT(key: string, fallback: string): string {
  return translator?.(key, fallback) ?? fallback;
}
