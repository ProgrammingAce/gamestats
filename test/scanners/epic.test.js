import { describe, it, expect, beforeEach } from 'vitest';

describe('Epic Scanner', () => {
  let epic;

  beforeEach(async () => {
    delete require.cache[require.resolve('../../server/scanners/epic.js')];
    epic = await import('../../server/scanners/epic.js');
  });

  it('exports required functions', () => {
    expect(epic.default).toBeDefined();
    expect(epic.default.launcherName).toBe('Epic');
    expect(typeof epic.default.isAvailable).toBe('function');
    expect(typeof epic.default.scan).toBe('function');
  });

  it('has default export with correct interface', async () => {
    expect(epic.default.launcherName).toBe('Epic');
    expect(await epic.default.isAvailable()).toBe(false);
  });
});
