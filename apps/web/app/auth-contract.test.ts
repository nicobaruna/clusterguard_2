import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const store = readFileSync(new URL('./auth-store.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('Supabase Auth implementation contract', () => {
  it('restores the local Supabase session and reloads the trusted profile', () => {
    expect(store).toContain('supabase.auth.getSession()');
    expect(store).toContain(".from('users')");
    expect(store).toContain("await supabase.auth.signOut()");
  });

  it('does not submit a client-selected role during signup', () => {
    expect(store).toContain("options: { data: { full_name: fullName, house_number: houseNumber } }");
    expect(store).not.toContain("role: 'WARGA'");
  });

  it('always releases the submit state after an Auth request', () => {
    expect(page).toContain('try {');
    expect(page).toContain('finally {');
    expect(page).toContain('setIsSubmitting(false)');
  });
});
