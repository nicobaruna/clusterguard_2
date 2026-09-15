import {
  readOfflineQueue,
  updateOfflineRecord,
  type OfflineRecord,
} from './offline-store';

type SyncResponse = { status: number };
type SyncSender = (record: OfflineRecord) => Promise<SyncResponse>;
type SyncManagerOptions = {
  send: SyncSender;
  onUnauthorized?: () => void;
  intervalMs?: number;
};
const leaseKey = 'clusterguard-offline-sync-lease';
const leaseMs = 30_000;

export function createSyncManager({ send, onUnauthorized, intervalMs = 15_000 }: SyncManagerOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let syncing = false;
  const leaseOwner = `${Date.now()}-${Math.random()}`;

  const acquireLease = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const current = window.localStorage.getItem(leaseKey);
      if (current) {
        const lease = JSON.parse(current) as { owner: string; expiresAt: number };
        if (lease.owner !== leaseOwner && lease.expiresAt > Date.now()) return false;
      }
      window.localStorage.setItem(leaseKey, JSON.stringify({ owner: leaseOwner, expiresAt: Date.now() + leaseMs }));
      const acquired = JSON.parse(window.localStorage.getItem(leaseKey) ?? '{}') as { owner?: string };
      return acquired.owner === leaseOwner;
    } catch {
      return false;
    }
  };

  const releaseLease = (): void => {
    try {
      const current = window.localStorage.getItem(leaseKey);
      if (current && (JSON.parse(current) as { owner?: string }).owner === leaseOwner) window.localStorage.removeItem(leaseKey);
    } catch {
      // Lease expiry prevents a failed cleanup from blocking future sync.
    }
  };

  const runSync = async (): Promise<void> => {
    syncing = true;
    const renewal = setInterval(() => {
      try {
        window.localStorage.setItem(leaseKey, JSON.stringify({ owner: leaseOwner, expiresAt: Date.now() + leaseMs }));
      } catch {
        // The lease remains bounded if storage is unavailable.
      }
    }, leaseMs / 2);
    try {
      const now = Date.now();
      const records = readOfflineQueue().filter((record) => (
        (record.status === 'pending' || (record.status === 'failed' && record.retryable !== false))
        && (!record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= now)
      ));
      for (const record of records) {
        updateOfflineRecord(record.localId, { status: 'syncing', lastError: undefined });
        try {
          const response = await send(record);
          if (response.status >= 200 && response.status < 300) {
            updateOfflineRecord(record.localId, { status: 'synced', syncedAt: new Date().toISOString() });
          } else if (response.status === 401) {
            updateOfflineRecord(record.localId, { status: 'failed', retryable: false, lastError: 'UNAUTHORIZED' });
            onUnauthorized?.();
            break;
          } else if (response.status === 429 || response.status >= 500) {
            const retryCount = record.retryCount + 1;
            updateOfflineRecord(record.localId, {
              status: 'failed',
              retryable: true,
              retryCount,
              lastError: `HTTP_${response.status}`,
              nextAttemptAt: new Date(Date.now() + Math.min(60_000, 2 ** retryCount * 1_000)).toISOString(),
            });
          } else {
            updateOfflineRecord(record.localId, { status: 'failed', retryable: false, retryCount: record.retryCount + 1, lastError: `HTTP_${response.status}` });
          }
        } catch {
          updateOfflineRecord(record.localId, {
            status: 'pending',
            retryable: true,
            retryCount: record.retryCount + 1,
            lastError: 'NETWORK_ERROR',
            nextAttemptAt: new Date(Date.now() + Math.min(60_000, 2 ** (record.retryCount + 1) * 1_000)).toISOString(),
          });
        }
      }
    } finally {
      clearInterval(renewal);
      syncing = false;
    }
  };

  const syncPending = async (): Promise<void> => {
    if (syncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      try {
        await navigator.locks.request('clusterguard-offline-sync', { ifAvailable: true }, async (lock) => {
          if (lock) await runSync();
        });
        return;
      } catch {
        // Fall back to the renewed localStorage lease if Web Locks is unavailable.
      }
    }
    if (!acquireLease()) return;
    try { await runSync(); } finally { releaseLease(); }
  };

  const handleOnline = () => void syncPending();

  const start = (): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    stop();
    window.addEventListener('online', handleOnline);
    timer = setInterval(() => void syncPending(), intervalMs);
    void syncPending();
    return stop;
  };

  const stop = (): void => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  return { start, stop, syncPending };
}
