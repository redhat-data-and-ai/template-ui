import type { ReactNode } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import './dialogs.css';

export interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="app-kbd">{children}</kbd>;
}

const rows: { combo: ReactNode; action: string }[] = [
  {
    combo: <Kbd>/</Kbd>,
    action: 'Focus chat input',
  },
  {
    combo: <Kbd>Esc</Kbd>,
    action: 'Cancel stream / blur input',
  },
  {
    combo: (
      <span className="app-kbd-combo">
        <Kbd>Ctrl</Kbd>
        <span className="app-kbd-combo__hint">+</span>
        <Kbd>N</Kbd>
        <span className="app-kbd-combo__hint">(Mac: ⌘N)</span>
      </span>
    ),
    action: 'New chat',
  },
  {
    combo: (
      <span className="app-kbd-combo">
        <Kbd>Ctrl</Kbd>
        <span className="app-kbd-combo__hint">+</span>
        <Kbd>Shift</Kbd>
        <span className="app-kbd-combo__hint">+</span>
        <Kbd>S</Kbd>
        <span className="app-kbd-combo__hint">(Mac: ⌘⇧S)</span>
      </span>
    ),
    action: 'Open settings',
  },
  {
    combo: <Kbd>?</Kbd>,
    action: 'Show this dialog',
  },
  {
    combo: (
      <span className="app-kbd-combo">
        <Kbd>Ctrl</Kbd>
        <span className="app-kbd-combo__hint">+</span>
        <Kbd>Shift</Kbd>
        <span className="app-kbd-combo__hint">+</span>
        <Kbd>E</Kbd>
        <span className="app-kbd-combo__hint">(Mac: ⌘⇧E)</span>
      </span>
    ),
    action: 'Export chat',
  },
];

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Modal
      variant={ModalVariant.small}
      isOpen={isOpen}
      onClose={onClose}
      aria-label="Keyboard shortcuts"
    >
      <ModalHeader title="Keyboard Shortcuts" />
      <ModalBody>
        <Table aria-label="Keyboard shortcuts" variant="compact" gridBreakPoint="">
          <Thead>
            <Tr>
              <Th width={45}>Shortcut</Th>
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.action}>
                <Td dataLabel="Shortcut">{row.combo}</Td>
                <Td dataLabel="Action">{row.action}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
