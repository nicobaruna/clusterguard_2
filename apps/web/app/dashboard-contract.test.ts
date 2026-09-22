import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const store = readFileSync(new URL('./auth-store.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const confirm = readFileSync(new URL('./sos/confirm/page.tsx', import.meta.url), 'utf8');

describe('Dashboard Warga implementation contract', () => {
  it('loads house_number with the trusted profile for the greeting', () => {
    expect(store).toContain("select('full_name, phone_number, house_number, role')");
    expect(store).toContain('houseNumber: profile.house_number ?? undefined');
  });

  it('renders the greeting with the full name and house number', () => {
    expect(page).toContain("Halo, {user?.fullName}");
    expect(page).toContain('houseNumber ? ` (${user.houseNumber})` :');
  });

  it('presents the three massive category cards with consistent colors (design §2.1)', () => {
    expect(page).toContain("value: 'MEDIS'");
    expect(page).toContain("value: 'BENCANA'");
    expect(page).toContain("value: 'KEAMANAN'");
    expect(page).toContain('var(--critical)');
    expect(page).toContain('var(--warning)');
    expect(page).toContain('var(--security)');
    expect(page).toContain("name === 'ambulance'");
    expect(page).toContain("name === 'flame'");
    expect(page).toContain('M12 3l7 3v5');
  });

  it('navigates to the confirmation screen carrying the selected category', () => {
    expect(page).toContain('router.push(`/sos/confirm?category=${category.value}`)');
  });

  it('confirmation route only admits the three allowed categories', () => {
    expect(confirm).toContain("['MEDIS', 'BENCANA', 'KEAMANAN']");
    expect(confirm).toContain('searchParams.category');
    expect(confirm).toContain('! DARURAT {category} !');
  });
});