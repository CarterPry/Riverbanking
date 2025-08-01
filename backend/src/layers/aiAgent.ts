// backend/src/layers/aiAgent.ts
import { build } from '../utils/promptBuilder';
import { rules } from '../protocols';

export async function queryLLM(prompt: string) {
  const fullPrompt = build('fallback', prompt) + '\nRules: ' + rules.join('\n');
  // Fetch to Ollama with fullPrompt, temp=0.2
  return { response: 'Stub LLM output', confidence: 0.9 };
}