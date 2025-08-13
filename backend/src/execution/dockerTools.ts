// Docker tool definitions with correct images and commands
export interface DockerTool {
  image: string;
  command: (target: string, options?: any) => string[];
  timeout: number;
  volumeMounts?: string[];
}

function extractDomain(target: string): string {
  try {
    const url = new URL(target);
    return url.hostname;
  } catch {
    return target;
  }
}

const REGISTRY_MIRROR = process.env.REGISTRY_MIRROR || '';
const withMirror = (image: string): string => {
  if (!REGISTRY_MIRROR) return image;
  if (image.startsWith('local/')) return image;
  // if image already contains a registry host, replace it
  const parts = image.split('/');
  if (parts.length > 1 && parts[0].includes('.')) {
    parts.shift();
    return `${REGISTRY_MIRROR}/${parts.join('/')}`;
  }
  return `${REGISTRY_MIRROR}/${image}`;
};

export const DOCKER_TOOLS: Record<string, DockerTool> = {
  'subdomain-scanner': {
    // Prefer runner-based tools (dns/http wrappers could be added later)
    image: 'projectdiscovery/subfinder:latest',
    command: (target: string) => ['-d', extractDomain(target), '-silent'],
    timeout: 60000
  },
  // Passive recon / OSINT
  'whois': {
    image: 'alpine:3',
    command: (target: string) => {
      const domain = extractDomain(target);
      return ['sh', '-c', `apk add --no-cache whois >/dev/null 2>&1 && whois ${domain}`];
    },
    timeout: 120000
  },
  'crtsh-lookup': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      // Query certificate transparency logs for subdomains
      return ['-sSL', `https://crt.sh/?q=%25.${domain}&output=json`];
    },
    timeout: 60000
  },
  'bgpview-asn': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      // Best-effort heuristic: query bgpview for org/domain
      return ['-sSL', `https://api.bgpview.io/search?query_term=${domain}`];
    },
    timeout: 60000
  },
  // DNS and metadata
  'dig-any': {
    image: 'alpine:3',
    command: (target: string) => {
      const domain = extractDomain(target);
      return ['sh', '-c', `apk add --no-cache bind-tools >/dev/null 2>&1 && dig ANY ${domain} +noall +answer`];
    },
    timeout: 60000
  },
  'robots-fetch': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      const url = domain.startsWith('http') ? `${domain}/robots.txt` : `https://${domain}/robots.txt`;
      return ['-sSL', url];
    },
    timeout: 30000
  },
  'sitemap-fetch': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      const url = domain.startsWith('http') ? `${domain}/sitemap.xml` : `https://${domain}/sitemap.xml`;
      return ['-sSL', url];
    },
    timeout: 30000
  },
  'port-scanner': {
    // Use pre-baked runner with NDJSON wrapper
    image: 'local/runner:latest',
    command: (target: string) => ['nmap2ndjson', target],
    timeout: 300000
  },
  'directory-scanner': {
    image: 'projectdiscovery/katana:latest',
    command: (target: string) => [
      '-u', target, '-d', '2', '-js-crawl', '-known-files', 'all',
      // No form-fill by default for safety/determinism
      '-json', '-silent'
    ],
    timeout: 180000
  },
  'directory-bruteforce': {
    image: 'secsi/ffuf:2.0.0',
    command: (target: string, options?: any) => {
      const wordlist = options?.wordlist || '/seclists/Discovery/Web-Content/common.txt';
      // Ensure target is a valid URL with scheme for ffuf.
      const url = target.startsWith('http') ? target : `https://${target}`;
      return [
        '-u', `${url}/FUZZ`,
        '-w', wordlist,
        '-mc', 'all',
        '-fc', '404',
        '-ac',
        '-o', '-',
        '-of', 'json',
        // Tune for stability on modest hosts
        '-t', '20',
        '-rate', '50',
        '-timeout', '10',
        '-maxtime', '120'
      ];
    },
    timeout: 300000,
    volumeMounts: ['/Users/carte/Downloads/multicontext/seclists:/seclists:ro']
  },
  'tech-fingerprint': {
    image: 'projectdiscovery/httpx:latest',
    command: (target: string) => ['-u', target, '-tech-detect', '-json', '-silent'],
    timeout: 60000
  },
  'crawler': {
    image: 'projectdiscovery/katana:latest',
    command: (target: string) => ['-u', target, '-jsonl', '-silent', '-d', '3'],
    timeout: 120000
  },
  'parameter-discovery': {
    image: 'secsi/arjun:latest',
    // Image entrypoint is arjun
    command: (target: string) => ['-u', target, '--stable', '--disable-redirects', '-T', '20', '-m', 'GET', '-oJ', '-'],
    timeout: 1800000
  },
  'waf-detection': {
    image: 'osodevops/wafw00f:latest',
    command: (target: string) => ['-a', target],
    timeout: 120000
  },
  'ssl-scanner': {
    // Use pre-baked runner with NDJSON wrapper
    image: 'local/runner:latest',
    command: (target: string) => ['testssl2ndjson', target],
    timeout: 900000
  },
  'api-discovery': {
    image: 'local/runner:latest',
    command: (target: string, options?: any) => {
      const wordlist = options?.wordlist || '/seclists/Discovery/Web-Content/api/api-endpoints.txt';
      return ['kr2ndjson', 'brute', target, '-w', wordlist];
    },
    timeout: 300000,
    volumeMounts: ['/Users/carte/Downloads/multicontext/seclists:/seclists:ro']
  },
  'api-fuzzer': {
    image: 'local/runner:latest',
    command: (target: string, options?: any) => {
      const wordlist = options?.wordlist || '/seclists/Discovery/Web-Content/api/api-endpoints.txt';
      return ['kr2ndjson', 'brute', target, '-w', wordlist];
    },
    timeout: 300000,
    volumeMounts: ['/Users/carte/Downloads/multicontext/seclists:/seclists:ro']
  },
  'jwt-analyzer': {
    image: 'docker.io/ticarpi/jwt_tool:v2.3.0',
    // Image entrypoint already runs jwt_tool.py
    command: (target: string, options?: any) => {
      const token = options?.token;
      return token ? [token, '-M', 'at', '-t', target] : ['-h'];
    },
    timeout: 120000
  },
  'vulnerability-scanner': {
    image: 'projectdiscovery/nuclei:latest',
    command: (target: string) => ['-u', target, '-severity', 'critical,high,medium', '-timeout', '15', '-retries', '0', '-rl', '50', '-jsonl', '-silent'],
    timeout: 300000
  },
  // Additional Passive OSINT
  'passive-dns': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      return ['-sSL', `https://dns.bufferover.run/dns?q=${domain}`];
    },
    timeout: 60000
  },
  'search-dorking': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      const q = encodeURIComponent(`site:${domain} (filetype:pdf OR filetype:doc OR filetype:xls OR "index of")`);
      return ['-sSL', `https://duckduckgo.com/html/?q=${q}`];
    },
    timeout: 60000
  },
  'shodan-search': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const key = process.env.SHODAN_API_KEY || '';
      const domain = extractDomain(target);
      // Hostname search query
      return ['-sSL', `https://api.shodan.io/shodan/host/search?key=${key}&query=hostname:${domain}`];
    },
    timeout: 60000
  },
  'wayback-urls': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      // Use Wayback CDX original URLs
      return ['-sSL', `http://web.archive.org/cdx/search/cdx?url=*.${domain}/*&output=json&fl=original&collapse=urlkey`];
    },
    timeout: 60000
  },
  'company-registry': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      const q = encodeURIComponent(domain.replace(/^www\./, ''));
      return ['-sSL', `https://api.opencorporates.com/companies/search?q=${q}`];
    },
    timeout: 60000
  },
  'paste-search': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const domain = extractDomain(target);
      return ['-sSL', `https://psbdmp.ws/api/search/${domain}`];
    },
    timeout: 60000
  },
  'news-osint': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const key = process.env.NEWSAPI_KEY || '';
      const domain = extractDomain(target);
      const q = encodeURIComponent(domain);
      return ['-sSL', `https://newsapi.org/v2/everything?q=${q}&pageSize=50&apiKey=${key}`];
    },
    timeout: 60000
  },
  // Additional Active Recon
  'zone-transfer': {
    image: 'alpine:3',
    command: (target: string) => {
      const domain = extractDomain(target);
      const script = `apk add --no-cache bind-tools >/dev/null 2>&1; for ns in $(dig NS ${domain} +short); do dig @${'$'}ns ${domain} AXFR +time=3 +tries=1; done`;
      return ['sh', '-c', script];
    },
    timeout: 60000
  },
  'http-methods': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return ['-sSLI', '-X', 'OPTIONS', url];
    },
    timeout: 30000
  },
  'vhost-enum': {
    image: 'kalilinux/kali-rolling',
    command: (target: string, options?: any) => {
      const wordlist = options?.wordlist || '/seclists/Discovery/DNS/subdomains-top1million-20000.txt';
      const url = target.startsWith('http') ? target : `https://${target}`;
      const cmd = `apt-get -qq update && apt-get -qq install -y gobuster >/dev/null 2>&1 && gobuster vhost -u ${url} -w ${wordlist} -t 50 -o -`;
      return ['sh', '-c', cmd];
    },
    timeout: 300000,
    volumeMounts: ['/Users/carte/Downloads/multicontext/seclists:/seclists:ro']
  },
  'favicon-hash': {
    image: 'alpine:3',
    command: (target: string) => {
      const url = target.startsWith('http') ? target : `https://${target}`;
      const script = `apk add --no-cache curl coreutils >/dev/null 2>&1; curl -sSL ${url}/favicon.ico | md5sum | awk '{print ${'$'}1}'`;
      return ['sh', '-c', script];
    },
    timeout: 30000
  },
  'error-page-analysis': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return ['-sSL', `${url}/this-page-should-not-exist-12345`];
    },
    timeout: 30000
  },
  'cookie-analysis': {
    image: 'curlimages/curl:latest',
    command: (target: string) => {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return ['-sSLI', url];
    },
    timeout: 30000
  },
  'source-leak-checks': {
    image: 'alpine:3',
    command: (target: string) => {
      const url = target.startsWith('http') ? target : `https://${target}`;
      const script = `apk add --no-cache curl >/dev/null 2>&1; for p in .git/HEAD .svn/entries .env backup.zip; do code=$(curl -s -o /dev/null -w "%{http_code}" ${url}/${'$'}p); echo ${'$'}code ${'$'}p; done`;
      return ['sh', '-c', script];
    },
    timeout: 30000
  }
};

export function getDockerTool(toolName: string): DockerTool | undefined {
  return DOCKER_TOOLS[toolName];
}

export function isToolAvailable(toolName: string): boolean {
  return toolName in DOCKER_TOOLS;
}

export function getAvailableTools(): string[] {
  return Object.keys(DOCKER_TOOLS);
}
