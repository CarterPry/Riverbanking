export const FALLBACKS: Record<string, string[]> = {
  'port-scanner': ['tech-fingerprint'],
  'directory-scanner': ['crawler'],
  'directory-bruteforce': ['crawler'],
  'api-discovery': ['directory-bruteforce'],
  'api-fuzzer': ['directory-bruteforce'],
  'waf-detection': [],
  'parameter-discovery': ['crawler']
};

export function getFallbackChain(tool: string): string[] {
  return FALLBACKS[tool] || [];
}


