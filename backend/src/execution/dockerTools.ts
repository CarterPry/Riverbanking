// Docker tool definitions with correct images and commands
export interface DockerTool {
  image: string;
  command: (target: string, options?: any) => string[];
  timeout: number;
  volumeMounts?: string[];
}

export const DOCKER_TOOLS: Record<string, DockerTool> = {
  'subdomain-scanner': {
    image: 'projectdiscovery/subfinder:latest',
    command: (target: string) => ['-d', target, '-silent'],
    timeout: 60000
  },
  'port-scanner': {
    image: 'instrumentisto/nmap:latest', 
    command: (target: string) => ['-sV', '-Pn', '-p-', '--min-rate=1000', '-oX', '-', target],
    timeout: 300000
  },
  'directory-scanner': {
    image: 'projectdiscovery/katana:latest',
    command: (target: string) => [
      '-u', target, '-d', '2', '-js-crawl', '-known-files', 'all',
      '-automatic-form-fill', '-json', '-silent'
    ],
    timeout: 180000
  },
  'directory-bruteforce': {
    image: 'ghcr.io/projectdiscovery/ffuf:latest',
    command: (target: string, options?: any) => {
      const wordlist = options?.wordlist || '/seclists/Discovery/Web-Content/common.txt';
      return [
        '-u', `${target}/FUZZ`,
        '-w', wordlist,
        '-mc', 'all',
        '-fc', '404',
        '-ac',
        '-o', '/tmp/ffuf-results.json',
        '-of', 'json',
        '-t', '50',
        '-rate', '100'
      ];
    },
    timeout: 300000,
    volumeMounts: ['./seclists:/seclists:ro']
  },
  'tech-fingerprint': {
    image: 'projectdiscovery/httpx:latest',
    command: (target: string) => ['-u', target, '-tech-detect', '-json', '-silent'],
    timeout: 60000
  },
  'crawler': {
    image: 'projectdiscovery/katana:latest',
    command: (target: string) => ['-u', target, '-json', '-silent', '-d', '3'],
    timeout: 120000
  },
  'vulnerability-scanner': {
    image: 'projectdiscovery/nuclei:latest',
    command: (target: string) => ['-u', target, '-severity', 'critical,high,medium', '-json', '-silent'],
    timeout: 300000
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
