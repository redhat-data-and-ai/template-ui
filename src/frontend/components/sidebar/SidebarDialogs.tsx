import { useState } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from '@patternfly/react-core';

interface SidebarDialogsProps {
  deletingChatId: string | null;
  onCloseDeleteChat: () => void;
  onDeleteChat: (chatId: string) => void;
  deletingProjectId: string | null;
  deletingThreadCount: number;
  onCloseDeleteProject: () => void;
  onDeleteProject?: (
    projectId: string,
    options?: { keepThreads?: boolean },
  ) => Promise<boolean>;
  unassigningProjectId: string | null;
  onCloseUnassign: () => void;
  onUnassignAll?: (projectId: string) => Promise<boolean>;
}

/** Confirmation dialogs for the destructive sidebar actions. */
export function SidebarDialogs({
  deletingChatId,
  onCloseDeleteChat,
  onDeleteChat,
  deletingProjectId,
  deletingThreadCount,
  onCloseDeleteProject,
  onDeleteProject,
  unassigningProjectId,
  onCloseUnassign,
  onUnassignAll,
}: SidebarDialogsProps) {
  const [unassignBusy, setUnassignBusy] = useState(false);
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false);

  return (
    <>
    <Modal
      variant={ModalVariant.small}
      isOpen={deletingChatId !== null}
      onClose={() => onCloseDeleteChat()}
      aria-label="Delete chat confirmation"
    >
      <ModalHeader title="Delete chat" />
      <ModalBody>
        Are you sure you want to delete this chat? This action cannot be undone.
      </ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          onClick={() => {
            if (deletingChatId) {
              onDeleteChat(deletingChatId);
              onCloseDeleteChat();
            }
          }}
        >
          Delete
        </Button>
        <Button variant="link" onClick={() => onCloseDeleteChat()}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>

    <Modal
      variant={ModalVariant.small}
      isOpen={deletingProjectId !== null}
      onClose={() => {
        if (!projectDeleteBusy) onCloseDeleteProject();
      }}
      aria-label="Delete project confirmation"
    >
      <ModalHeader title="Delete project" />
      <ModalBody>
        Delete this project and all of its conversations? This cannot be undone.
        {deletingThreadCount > 0 && (
          <p className="app-dialog-note">
            To keep the conversations, use Unassign and delete — they will move to Chats.
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        {deletingThreadCount > 0 && (
          <Button
            variant="secondary"
            isDisabled={projectDeleteBusy}
            onClick={() => {
              if (!deletingProjectId) return;
              void (async () => {
                setProjectDeleteBusy(true);
                try {
                  const ok = await onDeleteProject?.(deletingProjectId, {
                    keepThreads: true,
                  });
                  if (ok) onCloseDeleteProject();
                } finally {
                  setProjectDeleteBusy(false);
                }
              })();
            }}
          >
            Unassign and delete
          </Button>
        )}
        <Button
          variant="danger"
          isDisabled={projectDeleteBusy}
          onClick={() => {
            if (!deletingProjectId) return;
            void (async () => {
              setProjectDeleteBusy(true);
              try {
                const ok = await onDeleteProject?.(deletingProjectId);
                if (ok) onCloseDeleteProject();
              } finally {
                setProjectDeleteBusy(false);
              }
            })();
          }}
        >
          Delete
        </Button>
        <Button
          variant="link"
          isDisabled={projectDeleteBusy}
          onClick={() => onCloseDeleteProject()}
        >
          Cancel
        </Button>
      </ModalFooter>
    </Modal>

    <Modal
      variant={ModalVariant.small}
      isOpen={unassigningProjectId !== null}
      onClose={() => {
        if (!unassignBusy) onCloseUnassign();
      }}
      aria-label="Unassign all conversations confirmation"
    >
      <ModalHeader title="Unassign all conversations" />
      <ModalBody>Move every conversation in this project back to Chats?</ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          isDisabled={unassignBusy}
          onClick={() => {
            if (!unassigningProjectId || !onUnassignAll) return;
            void (async () => {
              setUnassignBusy(true);
              try {
                const ok = await onUnassignAll(unassigningProjectId);
                if (ok) onCloseUnassign();
              } finally {
                setUnassignBusy(false);
              }
            })();
          }}
        >
          Unassign
        </Button>
        <Button
          variant="link"
          isDisabled={unassignBusy}
          onClick={() => onCloseUnassign()}
        >
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
}
