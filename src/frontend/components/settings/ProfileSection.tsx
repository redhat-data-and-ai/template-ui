import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant } from '@patternfly/react-core';
import { User, Mail, Shield, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';
import { clearAllChats, markThreadsDeleted, selectAllChats } from '../../redux/slices/chats';
import { selectDeveloperMode, setDeveloperMode } from '../../redux/slices/userSettings';
import { loadProjectsThunk } from '../../redux/slices/projects';
import { addToast } from '../../redux/slices/toasts';
import { deleteAllThreads, listAllThreadIds } from '../../services/agent-rest';
import { chatStorage } from '../../services/chatStorage';
import { releaseStreamingManager } from '../../lib/streaming/streamingManagerRegistry';
import { isPrivilegedUser } from '../../lib/role-utils';

export function ProfileSection() {
  const { t } = useTranslation();
  const authEnabled =
    useAppSelector((state: RootState) => state.config.features?.auth_enabled) ?? true;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chats = useAppSelector(selectAllChats);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const developerMode = useAppSelector(selectDeveloperMode);

  const userData = useMemo(() => window.USER_DATA, []);
  const username =
    userData?.preferred_username ||
    (typeof userData?.email === 'string' ? userData.email.split('@')[0] : '') ||
    '';
  const displayName =
    userData?.displayName || userData?.name || userData?.given_name || username || 'User';
  const email = userData?.email || '';

  const handleDeleteAll = async () => {
    const ids = chats.map((c) => c.id);
    ids.forEach((id) => releaseStreamingManager(id));
    dispatch(clearAllChats());
    chatStorage.clearChats();
    setConfirmDelete(false);

    // Everything the user owns, not everything the sidebar happens to
    // have loaded. The store holds the pages fetched so far; asking
    // the agent found 354 threads where the list showed a couple of
    // dozen, so "delete all" cleared the screen and the rest came
    // back on the next load.
    const serverIds = await listAllThreadIds();
    const allIds = [...new Set([...ids, ...serverIds])];

    // Mark them gone before the deletes start. They take a while at
    // this volume, and the layout reconciles the sidebar against the
    // server meanwhile — without this the not-yet-deleted ones came
    // back and the whole thing looked like it had failed.
    dispatch(markThreadsDeleted({ ids: allIds }));
    // On disk too: the sweep outlives this page only if the intent
    // does. A refresh halfway through used to abandon the rest and
    // forget what was meant to go.
    chatStorage.saveDeletedThreadIds(allIds);

    // Server-side sweep: one request that finishes whatever this
    // page does next.
    const { deleted, failed } = await deleteAllThreads();
    if (failed === 0) {
      chatStorage.clearDeletedThreadIds();
    }
    void dispatch(loadProjectsThunk());
    const failures = failed;

    if (failures > 0 && failures < allIds.length) {
      dispatch(addToast({ title: `${deleted} chats deleted, ${failures} failed on server`, variant: 'warning' }));
    } else if (allIds.length > 0 && failures === allIds.length) {
      dispatch(addToast({ title: t('toast.allChatsDeletedLocally'), variant: 'warning' }));
    } else {
      dispatch(addToast({ title: t('toast.allChatsDeleted'), variant: 'success' }));
    }
    navigate('/');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-2xl font-bold text-primary">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{displayName}</h3>
          {username && (
            <p className="text-sm text-muted-foreground">@{username}</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {email && (
          <div className="flex items-center gap-3 text-sm">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">{email}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground">{username || displayName}</span>
        </div>
        {/* Stated, not assumed. This line sat under a shield icon
            claiming SSO whatever was actually true — including on a
            local cluster with ENABLE_AUTH=false, where the identity
            above it is a development stand-in and nothing has been
            authenticated at all. A security claim that is sometimes
            wrong is worse than no claim. */}
        <div className="flex items-center gap-3 text-sm">
          <Shield
            className={`w-4 h-4 ${authEnabled ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500'}`}
          />
          <span
            className={
              authEnabled
                ? 'text-muted-foreground'
                : 'text-amber-600 dark:text-amber-500'
            }
          >
            {authEnabled ? t('profile.ssoAuthenticated') : t('profile.authDisabled')}
          </span>
        </div>
      </div>

      {isPrivilegedUser() && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">{t('profile.developerMode')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('profile.developerModeHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={developerMode}
              aria-label={t('profile.enableDeveloperMode')}
              onClick={() => dispatch(setDeveloperMode(!developerMode))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                developerMode ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  developerMode ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {chats.length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-destructive mb-2">{t('profile.dangerZone')}</h3>
          <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            <div>
              <p className="text-sm font-medium text-foreground">{t('profile.deleteAllConversations')}</p>
              <p className="text-xs text-muted-foreground">
                Permanently remove all {chats.length} chat{chats.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="w-3.5 h-3.5" />}>
              {t('profile.deleteAll')}
            </Button>
          </div>
        </div>
      )}

      <Modal
        variant={ModalVariant.small}
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        aria-label={t('profile.deleteAllChatsConfirm')}
      >
        <ModalHeader title={t('profile.deleteAllChats')} />
        <ModalBody>
          {t('profile.deleteAllBody', { count: chats.length })}
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDeleteAll}>
            {t('profile.deleteAll')}
          </Button>
          <Button variant="link" onClick={() => setConfirmDelete(false)}>
            {t('common.cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
