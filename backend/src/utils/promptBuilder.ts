// backend/src/utils/promptBuilder.ts
import fs from 'fs';

export function build(type: string, base: string) {
  let template = '';
  try {
    template = fs.readFileSync(`templates/prompts/${type}-template.txt`, 'utf8');
  } catch {
    template = 'Default template: ';
  }
  return template.replace('{base}', base) + '\nRole: SOC2 expert\nStep-back: Reflect and correct\nConstraint: No speculate; require auth context\nFew-shot: [examples from yml]';
}