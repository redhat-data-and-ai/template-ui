import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  AlertVariant,
} from '@patternfly/react-core';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { removeToast, selectToasts, type ToastVariant } from '../redux/slices/toasts';

const AUTO_DISMISS_MS = 6000;

const pfVariant: Record<ToastVariant, AlertVariant> = {
  success: AlertVariant.success,
  danger: AlertVariant.danger,
  warning: AlertVariant.warning,
  info: AlertVariant.info,
};

export function ToastNotifications() {
  const dispatch = useAppDispatch();
  const toasts = useAppSelector(selectToasts);

  if (toasts.length === 0) return null;

  return (
    <AlertGroup isToast isLiveRegion>
      {toasts.map((toast) => (
        <Alert
          key={toast.id}
          variant={pfVariant[toast.variant]}
          title={toast.title}
          timeout={AUTO_DISMISS_MS}
          onTimeout={() => dispatch(removeToast(toast.id))}
          actionClose={
            <AlertActionCloseButton
              onClose={() => dispatch(removeToast(toast.id))}
            />
          }
        >
          {toast.message}
        </Alert>
      ))}
    </AlertGroup>
  );
}
