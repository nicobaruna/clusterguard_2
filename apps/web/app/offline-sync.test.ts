import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOfflineQueue, enqueueOfflineRecord, readOfflineQueue, updateOfflineRecord } from './offline-store';
import { createSyncManager } from './sync-manager';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  clearOfflineQueue();
});

describe('offline queue and sync manager', () => {
  it('stores records as pending and rejects sensitive payload fields', () => {
    expect(() => enqueueOfflineRecord('auth', { password: 'secret' })).toThrow('OFFLINE_PAYLOAD_CONTAINS_SENSITIVE_FIELD');
    enqueueOfflineRecord('sos_event', { category: 'MEDIS' });
    const [record] = readOfflineQueue();
    expect(record.status).toBe('pending');
    expect(JSON.stringify(record)).not.toContain('token');
  });

  it('surfaces storage failures instead of reporting a false enqueue success', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    expect(() => enqueueOfflineRecord('sos_event', { category: 'MEDIS' })).toThrow('OFFLINE_STORAGE_UNAVAILABLE');
  });

  it('syncs successful records and stops on unauthorized responses', async () => {
    const first = enqueueOfflineRecord('sos_event', { category: 'MEDIS' });
    const second = enqueueOfflineRecord('sos_event', { category: 'KEAMANAN' });
    const onUnauthorized = vi.fn();
    const manager = createSyncManager({
      send: vi.fn(async (record) => record.localId === first.localId ? { status: 201 } : { status: 401 }),
      onUnauthorized,
    });

    await manager.syncPending();
    const records = readOfflineQueue();
    expect(records.find((record) => record.localId === first.localId)?.status).toBe('synced');
    expect(records.find((record) => record.localId === second.localId)?.lastError).toBe('UNAUTHORIZED');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('keeps network failures retryable and prevents concurrent runs', async () => {
    enqueueOfflineRecord('sos_event', { category: 'BENCANA' });
    let release: (() => void) | undefined;
    const send = vi.fn(() => new Promise<{ status: number }>((resolve) => { release = () => resolve({ status: 201 }); }));
    const manager = createSyncManager({ send });
    const firstRun = manager.syncPending();
    const secondRun = manager.syncPending();
    expect(send).toHaveBeenCalledOnce();
    release?.();
    await Promise.all([firstRun, secondRun]);
    expect(readOfflineQueue()[0].status).toBe('synced');
  });

  it('retries rate limits but does not retry permanent client errors immediately', async () => {
    const rateLimited = enqueueOfflineRecord('sos_event', { category: 'MEDIS' });
    const invalid = enqueueOfflineRecord('sos_event', { category: 'BENCANA' });
    const manager = createSyncManager({
      send: vi.fn(async (record) => record.localId === rateLimited.localId ? { status: 429 } : { status: 400 }),
    });

    await manager.syncPending();
    const records = readOfflineQueue();
    expect(records.find((record) => record.localId === rateLimited.localId)?.nextAttemptAt).toBeTruthy();
    expect(records.find((record) => record.localId === invalid.localId)?.nextAttemptAt).toBeUndefined();
    expect(records.find((record) => record.localId === invalid.localId)?.retryable).toBe(false);
  });

  it('prunes synchronized records older than the retention window', () => {
    const record = enqueueOfflineRecord('sos_event', { category: 'MEDIS' });
    updateOfflineRecord(record.localId, {
      status: 'synced',
      syncedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000).toISOString(),
    });
    expect(readOfflineQueue()).toHaveLength(0);
  });

  it('falls back to the lease when Web Locks rejects', async () => {
    enqueueOfflineRecord('sos_event', { category: 'MEDIS' });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, locks: { request: vi.fn().mockRejectedValue(new Error('unsupported')) } } });
    const send = vi.fn(async () => ({ status: 201 }));
    await createSyncManager({ send }).syncPending();
    expect(send).toHaveBeenCalledOnce();
    expect(readOfflineQueue()[0].status).toBe('synced');
  });
});
