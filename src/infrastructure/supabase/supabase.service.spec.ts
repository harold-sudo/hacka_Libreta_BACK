jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { assertServerKey, SupabaseService } from './supabase.service';

describe('Supabase startup configuration', () => {
  const valid = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_example',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_example',
  };
  const config = (values: Record<string, string | undefined>) =>
    ({ get: (name: string) => values[name] }) as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it.each(Object.keys(valid))(
    'identifies missing or blank %s before creating clients',
    (name) => {
      for (const value of [undefined, '', '   ', '""']) {
        expect(
          () => new SupabaseService(config({ ...valid, [name]: value })),
        ).toThrow(name);
        expect(createClient).not.toHaveBeenCalled();
      }
    },
  );

  it('passes normalized credentials to public, admin and fresh auth clients', () => {
    const values = Object.fromEntries(
      Object.entries(valid).map(([name, value]) => [name, `  "${value}"  `]),
    );
    const service = new SupabaseService(config(values));
    service.createAuthClient();
    const calls = jest.mocked(createClient).mock.calls;
    expect(calls.map(([url, key]) => [url, key])).toEqual([
      [valid.SUPABASE_URL, valid.SUPABASE_ANON_KEY],
      [valid.SUPABASE_URL, valid.SUPABASE_SERVICE_ROLE_KEY],
      [valid.SUPABASE_URL, valid.SUPABASE_ANON_KEY],
    ]);
  });

  it('does not disclose an invalid server credential in the error', () => {
    const secret = 'invalid-private-test-value';
    try {
      new SupabaseService(
        config({ ...valid, SUPABASE_SERVICE_ROLE_KEY: secret }),
      );
      throw new Error('Expected startup to reject the key');
    } catch (error) {
      expect((error as Error).message).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect((error as Error).message).not.toContain(secret);
    }
    expect(createClient).not.toHaveBeenCalled();
  });
});
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
