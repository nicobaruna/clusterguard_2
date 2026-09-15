export type UserRole = 'WARGA' | 'PIC' | 'SUPER_ADMIN';

export function isEmailLoginAllowed(identifier: string, role: UserRole): boolean {
  return identifier.includes('@') === (role === 'SUPER_ADMIN');
}

export function loginMismatchMessage(role: UserRole): string {
  return role === 'SUPER_ADMIN'
    ? 'Super Admin harus memakai email.'
    : 'Warga/PIC harus memakai nomor HP.';
}
