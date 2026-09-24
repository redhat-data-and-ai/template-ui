import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./prompt-md.js', () => ({
  loadPromptMdConfig: vi.fn(),
}));

vi.mock('./ldap-client.js', () => ({
  resolveUserRole: vi.fn(),
  PRIVILEGED_ROLES: new Set(['owners', 'admins', 'builders']),
}));

import { resolveRole, isPrivilegedRole } from './role-resolver';
import { loadPromptMdConfig } from './prompt-md.js';
import { resolveUserRole } from './ldap-client.js';

describe('role-resolver', () => {
  beforeEach(() => {
    vi.mocked(loadPromptMdConfig).mockReset();
    vi.mocked(resolveUserRole).mockReset();
    delete process.env.LDAP_URL;
  });

  describe('resolveRole', () => {
    it('returns "users" when no groups configured', async () => {
      vi.mocked(loadPromptMdConfig).mockReturnValue({ groups: null, accessibility: 'private' });
      const role = await resolveRole('user1');
      expect(role).toBe('users');
    });

    it('returns "users" when LDAP_URL is not set and accessibility is public', async () => {
      vi.mocked(loadPromptMdConfig).mockReturnValue({
        groups: [{ role: 'owners', group: 'test' }],
        accessibility: 'public',
      });
      const role = await resolveRole('user1');
      expect(role).toBe('users');
    });

    it('returns "denied" when LDAP_URL is not set and accessibility is private', async () => {
      vi.mocked(loadPromptMdConfig).mockReturnValue({
        groups: [{ role: 'owners', group: 'test' }],
        accessibility: 'private',
      });
      const role = await resolveRole('user1');
      expect(role).toBe('denied');
    });

    it('delegates to LDAP resolveUserRole when LDAP_URL is set', async () => {
      process.env.LDAP_URL = 'ldaps://ldap.example.com';
      vi.mocked(loadPromptMdConfig).mockReturnValue({
        groups: [{ role: 'owners', group: 'test-owners' }],
        accessibility: 'private',
      });
      vi.mocked(resolveUserRole).mockResolvedValue('owners');

      const role = await resolveRole('user1');
      expect(role).toBe('owners');
      expect(resolveUserRole).toHaveBeenCalledWith('user1', [{ role: 'owners', group: 'test-owners' }]);
    });

    it('returns "users" when LDAP returns "denied" but accessibility is public', async () => {
      process.env.LDAP_URL = 'ldaps://ldap.example.com';
      vi.mocked(loadPromptMdConfig).mockReturnValue({
        groups: [{ role: 'owners', group: 'test-owners' }],
        accessibility: 'public',
      });
      vi.mocked(resolveUserRole).mockResolvedValue('denied');

      const role = await resolveRole('user1');
      expect(role).toBe('users');
    });
  });

  describe('isPrivilegedRole', () => {
    it('returns true for owners, admins, builders', () => {
      expect(isPrivilegedRole('owners')).toBe(true);
      expect(isPrivilegedRole('admins')).toBe(true);
      expect(isPrivilegedRole('builders')).toBe(true);
    });

    it('returns false for users and denied', () => {
      expect(isPrivilegedRole('users')).toBe(false);
      expect(isPrivilegedRole('denied')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isPrivilegedRole(null as any)).toBe(false);
      expect(isPrivilegedRole(undefined as any)).toBe(false);
    });
  });
});
