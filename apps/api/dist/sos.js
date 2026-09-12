export function parseSosCategory(value) {
    const allowed = ['MEDIS', 'BENCANA', 'KEAMANAN'];
    if (!allowed.includes(value)) {
        throw new Error(`Invalid category: ${value}`);
    }
    return value;
}
export function createSosEvent(category, senderId) {
    return {
        id: crypto.randomUUID(),
        category: parseSosCategory(String(category)),
        status: 'PENDING',
        createdAt: Date.now(),
        senderId,
    };
}
export function isFallbackRequired(event, startedAt, now = Date.now()) {
    return event.status === 'PENDING' && now - startedAt >= 30_000;
}
