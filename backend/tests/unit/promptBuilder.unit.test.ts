// backend/tests/unit/promptBuilder.unit.test.ts
import { build } from '../../src/utils/promptBuilder';

test('builds structured prompt', () => {
  const prompt = build('classification', 'test input');
  expect(prompt).toContain('Role: SOC2 expert');
});