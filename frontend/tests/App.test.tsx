import '@testing-library/jest-dom';

describe('Frontend Test Setup', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true);
  });

  it('should work with React Testing Library matchers', () => {
    const element = document.createElement('div');
    element.textContent = 'Hello World';
    expect(element).toHaveTextContent('Hello World');
  });
}); 