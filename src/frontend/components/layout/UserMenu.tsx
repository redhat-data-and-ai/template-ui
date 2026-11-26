import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownItem, DropdownList, MenuToggle, Tooltip } from '@patternfly/react-core';
import { UserIcon } from '@patternfly/react-icons';
import { logout } from '../../services/logout';

function getUserDisplayName(): string {
  const u = window.USER_DATA;
  return u?.displayName || u?.name || u?.given_name || u?.preferred_username || 'User';
}

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const name = getUserDisplayName();
  const email = window.USER_DATA?.email || window.USER_DATA?.mail || undefined;

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={(_event, value) => {
        setIsOpen(false);
        if (value === 'settings') navigate('/settings');
        if (value === 'logout') void logout();
      }}
      popperProps={{ position: 'right' }}
      toggle={(toggleRef) => (
        <Tooltip content={name} position="bottom-end">
          <MenuToggle
            ref={toggleRef}
            variant="plain"
            onClick={() => setIsOpen((open) => !open)}
            isExpanded={isOpen}
            aria-label={`${name} menu`}
            icon={<UserIcon aria-hidden />}
          />
        </Tooltip>
      )}
    >
      <DropdownList aria-label="User menu">
        <DropdownItem value="user" isDisabled description={email}>
          {name}
        </DropdownItem>
        <DropdownItem value="settings">Settings</DropdownItem>
        <DropdownItem value="logout">Log out</DropdownItem>
      </DropdownList>
    </Dropdown>
  );
}
