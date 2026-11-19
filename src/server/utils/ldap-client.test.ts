import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = {
  search: vi.fn().mockResolvedValue({ searchEntries: [] }),
  bind: vi.fn().mockResolvedValue(undefined),
  unbind: vi.fn().mockResolvedValue(undefined),
};

vi.mock('ldapts', () => ({
  Client: class MockClient {
    isConnected = true;
    constructor(_opts?: any) {}
    bind(...args: any[]) { return mocks.bind(...args); }
    search(...args: any[]) { return mocks.search(...args); }
    unbind(...args: any[]) { return mocks.unbind(...args); }
  },
}));

const redisMock = {
  enabled: false,
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn(),
};

vi.mock('./redis.js', () => ({
  getRedisClient: vi.fn().mockImplementation(() => {
    if (!redisMock.enabled) return null;
    return { get: redisMock.get, setex: redisMock.setex };
  }),
}));

vi.mock('node:fs', () => ({
  default: { readFileSync: vi.fn() },
  readFileSync: vi.fn(),
}));

describe('ldap-client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mocks.search.mockReset().mockResolvedValue({ searchEntries: [] });
    mocks.bind.mockReset().mockResolvedValue(undefined);
    mocks.unbind.mockReset().mockResolvedValue(undefined);
    redisMock.enabled = false;
    redisMock.get.mockReset().mockResolvedValue(null);
    redisMock.setex.mockReset();

    process.env.LDAP_URL = 'ldaps://ldap.example.com';
    process.env.LDAP_BASE_UID = 'svc-user';
    process.env.LDAP_PASSWORD = 'secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function freshModule() {
    return await import('./ldap-client');
  }

  describe('ROLE_HIERARCHY & PRIVILEGED_ROLES', () => {
    it('has correct priority values', async () => {
      const { ROLE_HIERARCHY, PRIVILEGED_ROLES } = await freshModule();
      expect(ROLE_HIERARCHY.owners).toBe(4);
      expect(ROLE_HIERARCHY.admins).toBe(3);
      expect(ROLE_HIERARCHY.builders).toBe(2);
      expect(ROLE_HIERARCHY.users).toBe(1);
      expect(PRIVILEGED_ROLES.has('owners')).toBe(true);
      expect(PRIVILEGED_ROLES.has('users')).toBe(false);
    });
  });

  describe('getBindDn', () => {
    it('uses LDAP_BIND_DN override when set', async () => {
      process.env.LDAP_BIND_DN = 'uid=svc,cn=users,cn=accounts,dc=ipa,dc=example,dc=com';
      mocks.search.mockResolvedValue({
        searchEntries: [{ memberUid: ['user1'] }],
      });
      const { isUserInGroup } = await freshModule();
      await isUserInGroup('user1', 'test-group');
      expect(mocks.bind).toHaveBeenCalledWith(
        'uid=svc,cn=users,cn=accounts,dc=ipa,dc=example,dc=com',
        'secret',
      );
      delete process.env.LDAP_BIND_DN;
    });

    it('derives bind DN from LDAP_BASE_UID when LDAP_BIND_DN is not set', async () => {
      delete process.env.LDAP_BIND_DN;
      mocks.search.mockResolvedValue({
        searchEntries: [{ memberUid: ['user1'] }],
      });
      const { isUserInGroup } = await freshModule();
      await isUserInGroup('user1', 'test-group');
      expect(mocks.bind).toHaveBeenCalledWith(
        'uid=svc-user,ou=users,dc=example,dc=com',
        'secret',
      );
    });
  });

  describe('getGroupSearchBase', () => {
    it('uses LDAP_GROUP_SEARCH_BASE override when set', async () => {
      process.env.LDAP_GROUP_SEARCH_BASE = 'cn=groups,cn=accounts,dc=ipa,dc=example,dc=com';
      mocks.search.mockResolvedValue({ searchEntries: [] });
      const { isUserInGroup } = await freshModule();
      await isUserInGroup('user1', 'test-group');
      expect(mocks.search).toHaveBeenCalledWith(
        'cn=groups,cn=accounts,dc=ipa,dc=example,dc=com',
        expect.objectContaining({ filter: '(cn=test-group)' }),
      );
      delete process.env.LDAP_GROUP_SEARCH_BASE;
    });

    it('defaults to derived group search base when override not set', async () => {
      delete process.env.LDAP_GROUP_SEARCH_BASE;
      mocks.search.mockResolvedValue({ searchEntries: [] });
      const { isUserInGroup } = await freshModule();
      await isUserInGroup('user1', 'test-group');
      expect(mocks.search).toHaveBeenCalledWith(
        'ou=adhoc,ou=managedGroups,dc=example,dc=com',
        expect.anything(),
      );
    });
  });

  describe('isUserInGroup', () => {
    it('returns false when LDAP_URL is not set', async () => {
      delete process.env.LDAP_URL;
      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'my-group')).toBe(false);
    });

    it('returns true when user is found in group members (DN match)', async () => {
      mocks.search.mockResolvedValue({
        searchEntries: [{ member: ['uid=user1,ou=users,dc=example,dc=com'] }],
      });

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(true);
    });

    it('returns true when userId matches directly (memberUid)', async () => {
      mocks.search.mockResolvedValue({
        searchEntries: [{ memberUid: ['user1'] }],
      });

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(true);
    });

    it('returns false when user is not in group', async () => {
      mocks.search.mockResolvedValue({
        searchEntries: [{ member: ['uid=otheruser,ou=users,dc=example,dc=com'] }],
      });

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(false);
    });

    it('returns false when bind fails with transient error (retries twice)', async () => {
      mocks.bind.mockRejectedValue(new Error('connection refused'));

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(false);
      expect(mocks.bind).toHaveBeenCalledTimes(2);
    });

    it('returns false immediately on invalidCredentials without retrying', async () => {
      mocks.bind.mockRejectedValue(new Error('invalidCredentials'));

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(false);
      expect(mocks.bind).toHaveBeenCalledTimes(1);
    });

    it('returns false immediately on account locked without retrying', async () => {
      mocks.bind.mockRejectedValue(new Error('unwillingToPerform'));

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(false);
      expect(mocks.bind).toHaveBeenCalledTimes(1);
    });

    it('cooldown blocks subsequent bind attempts after auth error', async () => {
      mocks.bind.mockRejectedValue(new Error('invalidCredentials'));

      const { isUserInGroup } = await freshModule();
      await isUserInGroup('user1', 'test-group');
      mocks.bind.mockReset();

      await isUserInGroup('user1', 'test-group');
      expect(mocks.bind).not.toHaveBeenCalled();
    });

    it('uses Redis cache when available', async () => {
      redisMock.enabled = true;
      redisMock.get.mockResolvedValue('1');

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'cached-group')).toBe(true);
    });

    it('handles Buffer member values', async () => {
      mocks.search.mockResolvedValue({
        searchEntries: [{ member: [Buffer.from('uid=user1,ou=users,dc=example,dc=com')] }],
      });

      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(true);
    });

    it('returns false when no search entries found', async () => {
      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(false);
    });

    it('returns true when user matches IPA full DN (cn=users,cn=accounts)', async () => {
      process.env.LDAP_BIND_DN = 'uid=svc,cn=users,cn=accounts,dc=ipa,dc=example,dc=com';
      mocks.search.mockResolvedValue({
        searchEntries: [{ member: ['uid=user1,cn=users,cn=accounts,dc=ipa,dc=example,dc=com'] }],
      });
      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(true);
      delete process.env.LDAP_BIND_DN;
    });

    it('member matching is case-insensitive', async () => {
      mocks.search.mockResolvedValue({
        searchEntries: [{ memberUid: ['USER1'] }],
      });
      const { isUserInGroup } = await freshModule();
      expect(await isUserInGroup('user1', 'test-group')).toBe(true);
    });
  });

  describe('resolveUserRole', () => {
    it('returns "denied" when LDAP_URL is not set', async () => {
      delete process.env.LDAP_URL;
      const { resolveUserRole } = await freshModule();
      expect(await resolveUserRole('user1', [{ role: 'owners', group: 'test' }])).toBe('denied');
    });

    it('returns highest-priority matching role', async () => {
      mocks.search.mockResolvedValue({
        searchEntries: [{ memberUid: ['user1'] }],
      });

      const { resolveUserRole } = await freshModule();
      const role = await resolveUserRole('user1', [
        { role: 'builders', group: 'builders-group' },
        { role: 'admins', group: 'admins-group' },
      ]);
      expect(role).toBe('admins');
    });

    it('returns "denied" when user matches no groups', async () => {
      const { resolveUserRole } = await freshModule();
      expect(await resolveUserRole('user1', [{ role: 'owners', group: 'g' }])).toBe('denied');
    });
  });

  describe('closeLdapClient', () => {
    it('can be called safely', async () => {
      const { closeLdapClient } = await freshModule();
      await closeLdapClient();
    });
  });
});
