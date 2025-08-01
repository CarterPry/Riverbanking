// backend/tests/unit/feedbackLoop.unit.test.ts
import { FeedbackLoop } from '../../src/layers/feedbackLoop';

jest.mock('../../src/layers/aiAgent', () => ({
  queryLLM: jest.fn().mockResolvedValue({ response: 'Refined output', confidence: 0.9 })
}));

describe('FeedbackLoop', () => {
  let feedbackLoop: FeedbackLoop;

  beforeEach(() => {
    feedbackLoop = new FeedbackLoop();
  });

  test('refines output successfully', async () => {
    const output = { test: 'data' };
    const result = await feedbackLoop.refine(output);
    
    expect(result.confidence).toBe(0.9);
    expect(result.response).toBe('Refined output');
  });

  test('iterates on low confidence', async () => {
    const { queryLLM } = require('../../src/layers/aiAgent');
    
    // Mock low confidence first, then high confidence
    queryLLM
      .mockResolvedValueOnce({ response: 'Low confidence', confidence: 0.7 })
      .mockResolvedValueOnce({ response: 'High confidence', confidence: 0.9 });
    
    const output = { test: 'data' };
    const result = await feedbackLoop.refine(output);
    
    expect(queryLLM).toHaveBeenCalledTimes(2);
    expect(result.confidence).toBe(0.9);
  });
});