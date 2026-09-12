export type SosCategory = 'MEDIS' | 'BENCANA' | 'KEAMANAN';

export type SosEvent = {
  id: string;
  category: SosCategory;
  status: 'PENDING' | 'RESOLVED';
  createdAt: number;
  senderId: string;
};

export function parseSosCategory(value: string): SosCategory {
  const allowed = ['MEDIS', 'BENCANA', 'KEAMANAN'] as const;
  if (!allowed.includes(value as SosCategory)) {
    throw new Error(`Invalid category: ${value}`);
  }
  return value as SosCategory;
}

export function createSosEvent(category: SosCategory | string, senderId: string): SosEvent {
  return {
    id: crypto.randomUUID(),
    category: parseSosCategory(String(category)),
    status: 'PENDING',
    createdAt: Date.now(),
    senderId,
  };
}

export function isFallbackRequired(event: SosEvent, startedAt: number, now = Date.now()): boolean {
  return event.status === 'PENDING' && now - startedAt >= 30_000;
}
