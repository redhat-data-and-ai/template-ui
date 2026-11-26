import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Switch,
  Title,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { clearAllChats, selectAllChats } from '../../redux/slices/chats';
import { selectDeveloperMode, setDeveloperMode } from '../../redux/slices/userSettings';
import { loadProjectsThunk } from '../../redux/slices/projects';
import { addToast } from '../../redux/slices/toasts';
import { deleteThread } from '../../services/agent-rest';
import { chatStorage } from '../../services/chatStorage';
import { releaseStreamingManager } from '../../lib/streaming/streamingManagerRegistry';
import { isPrivilegedUser } from '../../lib/role-utils';

export function ProfileSection() {
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
    <div className="app-settings__stack">
      <div className="app-settings__row" style={{ justifyContent: 'flex-start' }}>
        <div className="app-settings__avatar" aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <Title headingLevel="h3" size="lg">
            {displayName}
          </Title>
          {username && <p className="app-settings__muted">@{username}</p>}
        </div>
      </div>

      <DescriptionList isHorizontal isCompact aria-label="Account details">
        {email && (
          <DescriptionListGroup>
            <DescriptionListTerm>Email</DescriptionListTerm>
            <DescriptionListDescription>{email}</DescriptionListDescription>
          </DescriptionListGroup>
        )}
        <DescriptionListGroup>
          <DescriptionListTerm>Username</DescriptionListTerm>
          <DescriptionListDescription>{username || displayName}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Sign-in</DescriptionListTerm>
          <DescriptionListDescription>Authenticated via SSO</DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>

      {isPrivilegedUser() && (
        <div className="app-settings__row">
          <div>
            <Title headingLevel="h3" size="md">
              Developer Mode
            </Title>
            <p className="app-settings__muted">
              Show the Developer tab with advanced tools and agent evaluation.
            </p>
          </div>
          <Switch
            id="developer-mode-switch"
            aria-label="Enable Developer Mode"
            isChecked={developerMode}
            onChange={(_event, checked) => dispatch(setDeveloperMode(checked))}
          />
        </div>
      )}

      {chats.length > 0 && (
        <Card isCompact>
          <CardBody>
            <Title headingLevel="h3" size="md" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--sm)' }}>
              Danger Zone
            </Title>
            <div className="app-settings__row">
              <div>
                <p>Delete all conversations</p>
                <p className="app-settings__muted">
                  Permanently remove all {chats.length} chat{chats.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<TrashIcon />}>
                Delete all
              </Button>
            </div>
          </CardBody>
        </Card>
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
