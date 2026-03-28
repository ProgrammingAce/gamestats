import { describe, it, expect, beforeEach } from 'vitest';

describe('DirectorySizeCalculator', () => {
  let calculator;

  beforeEach(async () => {
    const module = await import('../../server/services/directorySizeCalculator.js');
    calculator = new module.DirectorySizeCalculator();
  });

  it('has calculateSize method', async () => {
    expect(typeof calculator.calculateSize).toBe('function');
  });

  it('has abort method', () => {
    expect(typeof calculator.abort).toBe('function');
  });

  it('returns a number for size calculation', async () => {
    const result = await calculator.calculateSize(process.cwd(), new AbortController().signal);
    expect(typeof result).toBe('number');
  });

  it('handles abort signal', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    
    await expect(calculator.calculateSize('C:\\', controller.signal))
      .rejects
      .toThrow();
  });

  it('can be aborted programmatically', async () => {
    setTimeout(() => calculator.abort(), 10);
    
    await expect(calculator.calculateSize('C:\\', new AbortController().signal))
      .rejects
      .toThrow();
  });
});
