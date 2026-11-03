import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

export interface SessionExpiredModalProps {
  isOpen: boolean;
}

function buildGatewayLoginUrl(): string {
  const redirectPath = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}` || '/';
  return `/auth/login?redirect=${encodeURIComponent(redirectPath)}`;
}

export function SessionExpiredModal({ isOpen }: Readonly<SessionExpiredModalProps>) {
  const { t } = useTranslation();
  const goToLogin = () => {
    globalThis.location.assign(buildGatewayLoginUrl());
  };

  return (
    <Modal
      variant={ModalVariant.small}
      isOpen={isOpen}
      onClose={goToLogin}
      aria-label={t('session.expired')}
    >
      <ModalHeader title={t('session.title')} />
      <ModalBody>
        <p className="mb-3">{t('session.body')}</p>
        <p className="text-muted-foreground text-sm">{t('session.workSaved')}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={goToLogin}>
          {t('common.logIn')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
