describe('Backend Test Setup', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true);
  });

  it('should perform basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with async tests', async () => {
    const promise = Promise.resolve('hello');
    await expect(promise).resolves.toBe('hello');
  });
}); 