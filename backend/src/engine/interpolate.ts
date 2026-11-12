/** Replaces {{baseUrl}} and {{VAR}} placeholders with environment values. Unknown vars are left intact. */
export function interpolate(input: string | undefined, vars: Record<string, string>): string | undefined {
  if (input === undefined || input === null) return input;
  return String(input).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

/** Resolves a possibly-relative URL against the environment base URL. */
export function resolveUrl(url: string | undefined, baseUrl: string): string {
  const u = (url ?? '').trim();
  if (!u || u === '/') return baseUrl;
  if (/^https?:\/\//i.test(u)) return u;
  return new URL(u, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').toString();
}
