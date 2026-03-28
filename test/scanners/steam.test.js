import { describe, it, expect, beforeEach } from 'vitest';

describe('Steam Scanner', () => {
  let steam;

  beforeEach(async () => {
    // Clear module cache
    delete require.cache[require.resolve('../../server/scanners/steam.js')];
    steam = await import('../../server/scanners/steam.js');
  });

  it('exports required functions', () => {
    expect(steam.default).toBeDefined();
    expect(steam.default.launcherName).toBe('Steam');
    expect(typeof steam.default.isAvailable).toBe('function');
    expect(typeof steam.default.scan).toBe('function');
  });

  it('has default export with correct interface', async () => {
    expect(steam.default.launcherName).toBe('Steam');
    expect(await steam.default.isAvailable()).toBe(false);
  });
});
