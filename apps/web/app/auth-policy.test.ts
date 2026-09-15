import { describe, expect, it } from 'vitest';
import { isEmailLoginAllowed, loginMismatchMessage } from './auth-policy';

describe('authentication identifier policy', () => {
  it('allows Super Admin email and regular-user phone login', () => {
    expect(isEmailLoginAllowed('admin@example.com', 'SUPER_ADMIN')).toBe(true);
    expect(isEmailLoginAllowed('+628123456789', 'WARGA')).toBe(true);
    expect(isEmailLoginAllowed('+628123456789', 'PIC')).toBe(true);
  });

  it('rejects role and identifier mismatches', () => {
    expect(isEmailLoginAllowed('admin@example.com', 'WARGA')).toBe(false);
    expect(isEmailLoginAllowed('+628123456789', 'SUPER_ADMIN')).toBe(false);
    expect(loginMismatchMessage('SUPER_ADMIN')).toContain('email');
    expect(loginMismatchMessage('PIC')).toContain('nomor HP');
  });
});
