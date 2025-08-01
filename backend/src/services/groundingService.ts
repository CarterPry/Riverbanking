// backend/src/services/groundingService.ts
import fs from 'fs';
import { requirements } from '../compliance/requirements';
import { ccDefinitions } from '../compliance/mappings/soc2-controls';

export function fetch(key: string) {
  // Load from docs/ or compliance
  let grounding = '';
  try {
    grounding += fs.readFileSync(`docs/${key}.md`, 'utf8');
  } catch {}
  grounding += `\nRequirements: ${JSON.stringify(requirements[key] || {})}`;
  grounding += `\nCC Defs: ${JSON.stringify(ccDefinitions[key] || {})}`;
  return grounding;
}