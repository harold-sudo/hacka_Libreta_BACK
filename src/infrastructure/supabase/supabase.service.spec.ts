jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { assertServerKey } from './supabase.service';
describe('Server Supabase credentials', () => {
  const jwt = (role: string) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  it('rejects a public key mislabeled as service_role', () => {
    expect(() => assertServerKey(jwt('anon'), 'other')).toThrow(
      'clave secreta',
    );
    expect(() => assertServerKey(jwt('anon'), jwt('anon'))).toThrow('MÍSMA');
    expect(() => assertServerKey('sb_publishable_example', 'other')).toThrow();
    expect(() => assertServerKey('', 'other')).toThrow();
    expect(() => assertServerKey('   ', 'other')).toThrow();
  });
  it('accepts legacy and modern server key formats', () => {
    expect(() =>
      assertServerKey(jwt('service_role'), jwt('anon')),
    ).not.toThrow();
    expect(() => assertServerKey('sb_secret_example', 'public')).not.toThrow();
  });
  it('tolerates whitespace and surrounding quotes from copy/paste', () => {
    expect(() =>
      assertServerKey(`  ${jwt('service_role')}  `, jwt('anon')),
    ).not.toThrow();
    expect(() =>
      assertServerKey(`"${jwt('service_role')}"`, jwt('anon')),
    ).not.toThrow();
    expect(() =>
      assertServerKey(`\n  sb_secret_example\n  `, 'public'),
    ).not.toThrow();
  });
});
