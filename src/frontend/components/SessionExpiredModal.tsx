import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from '@patternfly/react-core';

export interface SessionExpiredModalProps {
  isOpen: boolean;
}

export function SessionExpiredModal({ isOpen }: SessionExpiredModalProps) {
  const goToLogin = () => {
    window.location.assign('/login');
  };

  return (
    <Modal
      variant={ModalVariant.small}
      isOpen={isOpen}
      onClose={goToLogin}
      aria-label="Session expired"
    >
      <ModalHeader title="Session Expired" />
      <ModalBody>
        <p className="mb-3">
          Your session has expired. Please log in again to continue.
        </p>
        <p className="text-muted-foreground text-sm">Your work has been saved.</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={goToLogin}>
          Log In
        </Button>
      </ModalFooter>
    </Modal>
  );
}
