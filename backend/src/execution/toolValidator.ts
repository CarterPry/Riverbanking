import fs from 'fs';
import path from 'path';

export interface ToolCatalogEntry {
	tool: string;
	allowedParameters: string[];
	requiredParameters?: string[];
	defaults?: Record<string, any>;
	outputFormat?: 'ndjson' | 'json' | 'text';
	maxTimeoutMs?: number;
  // Optional argv-level validation for container commands
  allowedFlags?: string[];
  defaultArgv?: string[];
  entrypoint?: string;
  forbiddenFlags?: string[];
}

export interface ToolCatalog {
	tools: ToolCatalogEntry[];
}

export class ToolValidator {
	private catalog: ToolCatalog;
	private byTool: Map<string, ToolCatalogEntry> = new Map();

	constructor(catalogPath: string = path.resolve(process.cwd(), '..', 'backend', 'config', 'tool-catalog.json')) {
		this.catalog = { tools: [] };
		try {
			const raw = fs.readFileSync(catalogPath, 'utf8');
			this.catalog = JSON.parse(raw);
		} catch {
			// If missing, use empty catalog. Validation will be permissive.
		}
		for (const entry of this.catalog.tools || []) {
			this.byTool.set(entry.tool, entry);
		}
	}

	public validateAndNormalize(toolName: string, params: Record<string, any>): { params: Record<string, any>; warnings: string[] } {
		const entry = this.byTool.get(toolName);
		const warnings: string[] = [];
		if (!entry) {
			// No strict validation available for this tool
			return { params, warnings };
		}

		const normalized: Record<string, any> = {};
		// Inject defaults first
		if (entry.defaults) {
			for (const [k, v] of Object.entries(entry.defaults)) {
				normalized[k] = v;
			}
		}
		// Copy only allowed params
		for (const [k, v] of Object.entries(params || {})) {
			if (entry.allowedParameters.includes(k)) {
				normalized[k] = v;
			} else {
				warnings.push(`Unknown parameter '${k}' for tool '${toolName}' denied`);
			}
		}
		// Ensure required
		for (const req of entry.requiredParameters || []) {
			if (normalized[req] === undefined || normalized[req] === null || normalized[req] === '') {
				warnings.push(`Missing required parameter '${req}' for tool '${toolName}'`);
			}
		}
		return { params: normalized, warnings };
	}

  public validateArgv(toolName: string, argv: string[]): { argv: string[]; warnings: string[] } {
    const entry = this.byTool.get(toolName);
    const warnings: string[] = [];
    if (!entry || !entry.allowedFlags || entry.allowedFlags.length === 0) {
      // No argv rules for this tool
      return { argv, warnings };
    }

    const allowed = new Set(entry.allowedFlags);
    const forbidden = new Set(entry.forbiddenFlags || []);
    const out: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const token = argv[i];
      if (typeof token === 'string' && token.startsWith('-')) {
        if (token === '-') { out.push(token); continue; }
        if (forbidden.has(token)) {
          throw new Error(`forbidden flag '${token}' for tool '${toolName}'`);
        }
        if (!allowed.has(token)) {
          warnings.push(`Unknown flag '${token}' for tool '${toolName}' denied`);
          // Skip this flag and its value if it looks like a pair
          continue;
        }
      }
      out.push(token);
    }

    // Add default argv tokens if missing (pair-aware, but tolerant)
    const defaults = entry.defaultArgv || [];
    for (let i = 0; i < defaults.length; i++) {
      const flag = defaults[i];
      if (typeof flag === 'string' && flag.startsWith('-')) {
        if (!out.includes(flag)) {
          // Add flag and its value if present in defaults list
          const next = defaults[i + 1];
          if (typeof next === 'string' && !next.startsWith('-')) {
            out.push(flag, next);
            i++; // consumed value
          } else {
            out.push(flag);
          }
        }
      } else {
        // Non-flag default token (e.g., subcommand)
        if (!out.includes(flag)) out.unshift(flag);
      }
    }

    return { argv: out, warnings };
  }
}


