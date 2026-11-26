import React, { useState } from 'react';
import {
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';

export interface RowAction {
  key: string;
  label: string;
  onSelect: () => void;
  isDanger?: boolean;
}

export interface RowActionGroup {
  key: string;
  label?: string;
  actions: RowAction[];
}

interface RowActionsProps {
  'aria-label': string;
  groups: RowActionGroup[];
}

/** Kebab menu shared by project and chat rows. Renders nothing without actions. */
export function RowActions({ 'aria-label': ariaLabel, groups }: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const visible = groups.filter((g) => g.actions.length > 0);
  if (visible.length === 0) return null;

  const lookup = new Map(visible.flatMap((g) => g.actions).map((a) => [a.key, a]));

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={(_event, value) => {
        setIsOpen(false);
        if (typeof value === 'string') lookup.get(value)?.onSelect();
      }}
      popperProps={{ position: 'right', appendTo: () => document.body }}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
          className={isOpen ? 'app-nav-row__toggle--open' : undefined}
          aria-label={ariaLabel}
          icon={<EllipsisVIcon />}
        />
      )}
    >
      {visible.map((group) => (
        <DropdownGroup key={group.key} label={group.label}>
          <DropdownList>
            {group.actions.map((action) => (
              <DropdownItem
                key={action.key}
                value={action.key}
                isDanger={action.isDanger}
              >
                {action.label}
              </DropdownItem>
            ))}
          </DropdownList>
        </DropdownGroup>
      ))}
    </Dropdown>
  );
}
