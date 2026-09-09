import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant } from '@patternfly/react-core';
import { User, Mail, Shield, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { clearAllChats, selectAllChats } from '../../redux/slices/chats';
import { loadProjectsThunk } from '../../redux/slices/projects';
import { addToast } from '../../redux/slices/toasts';
import { deleteThread } from '../../services/agent-rest';
import { chatStorage } from '../../services/chatStorage';
import { releaseStreamingManager } from '../../lib/streaming/streamingManagerRegistry';

export function ProfileSection() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const chats = useAppSelector(selectAllChats);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

    const results = await Promise.all(ids.map((id) => deleteThread(id).catch(() => false)));
    void dispatch(loadProjectsThunk());
    const failures = results.filter((r) => !r).length;

    if (failures > 0 && failures < ids.length) {
      dispatch(addToast({ title: `${ids.length - failures} chats deleted, ${failures} failed on server`, variant: 'warning' }));
    } else if (failures === ids.length) {
      dispatch(addToast({ title: 'Chats cleared locally but server deletion failed', variant: 'warning' }));
    } else {
      dispatch(addToast({ title: 'All chats deleted', variant: 'success' }));
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
        <div className="flex items-center gap-3 text-sm">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Authenticated via SSO</span>
        </div>
      </div>

      {chats.length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-destructive mb-2">Danger Zone</h3>
          <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
            <div>
              <p className="text-sm font-medium text-foreground">Delete all conversations</p>
              <p className="text-xs text-muted-foreground">
                Permanently remove all {chats.length} chat{chats.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="w-3.5 h-3.5" />}>
              Delete all
            </Button>
          </div>
        </div>
      )}

      <Modal
        variant={ModalVariant.small}
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        aria-label="Delete all chats confirmation"
      >
        <ModalHeader title="Delete all chats" />
        <ModalBody>
          This will permanently delete all {chats.length} conversations. This action cannot be undone.
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDeleteAll}>
            Delete all
          </Button>
          <Button variant="link" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
