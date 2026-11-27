import {
  Button,
  Content,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from '@patternfly/react-core';
import './dialogs.css';

export interface SessionExpiredModalProps {
  isOpen: boolean;
}

function buildGatewayLoginUrl(): string {
  const redirectPath = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}` || '/';
  return `/auth/login?redirect=${encodeURIComponent(redirectPath)}`;
}

export function SessionExpiredModal({ isOpen }: Readonly<SessionExpiredModalProps>) {
  const goToLogin = () => {
    globalThis.location.assign(buildGatewayLoginUrl());
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
        <Content component="p">
          Your session has expired. Please log in again to continue.
        </Content>
        <Content component="small" className="app-muted">Your work has been saved.</Content>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={goToLogin}>
          Log In
        </Button>
      </ModalFooter>
    </Modal>
  );
}
