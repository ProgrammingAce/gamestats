import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ScanOrchestrator', () => {
  let orchestrator;

  beforeEach(async () => {
    delete require.cache[require.resolve('../../server/services/scanOrchestrator.js')];
    const { ScanOrchestrator } = await import('../../server/services/scanOrchestrator.js');
    orchestrator = new ScanOrchestrator();
  });

  it('has startScan method', () => {
    expect(typeof orchestrator.startScan).toBe('function');
  });

  it('has abort method', () => {
    expect(typeof orchestrator.abort).toBe('function');
  });

  it('has deduplicateGames method', () => {
    expect(typeof orchestrator.deduplicateGames).toBe('function');
  });

  it('starts with running state', () => {
    expect(orchestrator.running).toBe(false);
  });

  it('deduplicates by normalized path', () => {
    const games = [
      { name: 'Game1', path: 'C:\\Games\\Game1', launcher: 'Steam', size: 1024 },
      { name: 'Game2', path: 'C:\\Games\\Game2', launcher: 'Epic', size: 2048 },
    ];

    const deduped = orchestrator.deduplicateGames(games);
    expect(deduped.length).toBe(2);
  });

  it('deduplicates case-insensitively', () => {
    const games = [
      { name: 'Game1', path: 'C:\\Games\\Game1', launcher: 'Steam', size: 1024 },
      { name: 'Game1', path: 'c:\\games\\game1', launcher: 'Epic', size: 2048 },
    ];

    const deduped = orchestrator.deduplicateGames(games);
    expect(deduped.length).toBe(1);
  });

  it('calls abort on both controllers', () => {
    const mockAbort = vi.fn();
    orchestrator.sizeCalculator.abort = mockAbort;
    
    orchestrator.abort();
    
    expect(mockAbort).toHaveBeenCalled();
  });

  it('sets running to false after abort', () => {
    orchestrator.running = true;
    orchestrator.abort();
    expect(orchestrator.running).toBe(false);
  });
});
