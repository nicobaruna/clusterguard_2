export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type OfflineRecord<T = unknown> = {
  localId: string;
  entity: string;
  payload: T;
  status: SyncStatus;
  retryCount: number;
  retryable?: boolean;
  lastError?: string;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
};

const storageKey = 'clusterguard-offline-queue';
const maxRecords = 100;
const retentionMs = 7 * 24 * 60 * 60 * 1_000;
const sensitiveKey = /password|token|secret|api[-_]?key|access[-_]?token|refresh[-_]?token/i;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    throw new Error('OFFLINE_STORAGE_UNAVAILABLE');
  }
}

export function readOfflineQueue(): OfflineRecord[] {
  let value: string | null = null;
  try {
    value = storage()?.getItem(storageKey) ?? null;
  } catch {
    throw new Error('OFFLINE_STORAGE_UNAVAILABLE');
  }
  if (!value) return [];
  try {
    const records = JSON.parse(value) as unknown;
    if (!Array.isArray(records)) return [];
    const cutoff = Date.now() - retentionMs;
    const pruned = (records as OfflineRecord[]).filter((record) => (
      !record.syncedAt || Date.parse(record.syncedAt) > cutoff
    ));
    if (pruned.length !== records.length) {
      try { writeOfflineQueue(pruned); } catch { /* best effort */ }
    }
    return pruned;
  } catch {
    return [];
  }
}

function writeOfflineQueue(records: OfflineRecord[]): void {
  try {
    storage()?.setItem(storageKey, JSON.stringify(records));
  } catch {
    throw new Error('OFFLINE_STORAGE_UNAVAILABLE');
  }
}

function localId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assertSafePayload(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  if (serialized && sensitiveKey.test(serialized)) throw new Error('OFFLINE_PAYLOAD_CONTAINS_SENSITIVE_FIELD');
}

export function enqueueOfflineRecord<T>(entity: string, payload: T): OfflineRecord<T> {
  assertSafePayload(payload);
  const now = new Date().toISOString();
  const record: OfflineRecord<T> = {
    localId: localId(),
    entity,
    payload,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const records = readOfflineQueue().filter((item) => item.status !== 'synced');
  if (records.length >= maxRecords) throw new Error('OFFLINE_QUEUE_FULL');
  writeOfflineQueue([...records, record]);
  return record;
}

export function updateOfflineRecord(localId: string, update: Partial<OfflineRecord>): void {
  writeOfflineQueue(readOfflineQueue().map((record) => (
    record.localId === localId
      ? { ...record, ...update, updatedAt: new Date().toISOString() }
      : record
  )));
}

export function clearOfflineQueue(): void {
  try {
    storage()?.removeItem(storageKey);
  } catch {
    // Storage cleanup is best-effort; the next read will recover safely.
  }
}

export { storageKey as offlineQueueStorageKey };
