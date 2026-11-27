import { useState, useEffect } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextInput,
  TextArea,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import './dialogs.css';

interface ProjectEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => boolean | void | 'error' | Promise<boolean | void | 'error'>;
  initialName?: string;
  initialDescription?: string;
  title?: string;
}

export function ProjectEditModal({
  isOpen,
  onClose,
  onSave,
  initialName = '',
  initialDescription = '',
  title = 'New Project',
}: ProjectEditModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setError(null);
      setSaving(false);
    }
  }, [isOpen, initialName, initialDescription]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const ok = await onSave(trimmed, description.trim());
      if (ok === false) {
        setError('A project with that name already exists');
        return;
      }
      if (ok === 'error') {
        setError('Could not save project');
        return;
      }
      onClose();
    } catch {
      setError('Could not save project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.small}
      isOpen={isOpen}
      onClose={onClose}
      aria-label={title}
    >
      <ModalHeader title={title} />
      <ModalBody>
        <Form onSubmit={(e) => e.preventDefault()}>
          <FormGroup label="Name" isRequired fieldId="project-name">
            <TextInput
              id="project-name"
              value={name}
              validated={error ? 'error' : 'default'}
              onChange={(_e, val) => {
                setName(val);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              autoFocus
            />
            {error && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error" role="alert">{error}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
          <FormGroup label="Description" fieldId="project-desc">
            <TextArea
              id="project-desc"
              value={description}
              onChange={(_e, val) => setDescription(val)}
              rows={3}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => void handleSave()}
          isDisabled={!name.trim() || saving}
        >
          Save
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
