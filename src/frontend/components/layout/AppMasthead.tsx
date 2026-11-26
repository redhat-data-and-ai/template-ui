import {
  Divider,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  PageToggleButton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { Link } from 'react-router-dom';
import { RedHatLogo } from '../RedHatLogo';
import { DebugToggle } from '../DebugToggle';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';

export interface AppMastheadProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function AppMasthead({ isSidebarOpen, onToggleSidebar }: AppMastheadProps) {
  const branding = useAppSelector((state: RootState) => state.config.branding);
  const title = branding?.title || window.APP_DATA?.agentName || 'Agent';
  const platformName = branding?.platform_name?.trim();
  const emphasis = branding?.platform_name_emphasis?.trim();
  const hasPlatform = Boolean(platformName || emphasis);

  const platformLabel = (
    <>
      {platformName}
      {platformName && emphasis ? ' ' : null}
      {emphasis ? <b>{emphasis}</b> : null}
    </>
  );

  return (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton
            isHamburgerButton
            aria-label="Toggle navigation"
            id="nav-toggle"
            isSidebarOpen={isSidebarOpen}
            onSidebarToggle={onToggleSidebar}
          />
        </MastheadToggle>
        <MastheadBrand style={{ alignItems: 'center', minWidth: 0 }}>
          <MastheadLogo component="div" style={{ width: 'max-content', maxWidth: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <Link to="/" aria-label={title} style={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt={title} style={{ height: '32px', width: 'auto' }} />
              ) : (
                <RedHatLogo style={{ height: '32px', width: 'auto', color: '#ee0000' }} />
              )}
            </Link>
            {hasPlatform ? (
              <>
                {isHttpUrl(branding?.platform_url) ? (
                  <a
                    href={branding?.platform_url}
                    style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 400 }}
                  >
                    {platformLabel}
                  </a>
                ) : (
                  <span style={{ whiteSpace: 'nowrap', fontWeight: 400 }}>{platformLabel}</span>
                )}
                <Divider orientation={{ default: 'vertical' }} style={{ height: '1.5rem' }} data-testid="masthead-separator" />
              </>
            ) : null}
            <span
              title={title}
              style={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {title}
            </span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="app-masthead-toolbar" isStatic>
          <ToolbarContent>
            <ToolbarGroup variant="action-group-plain" align={{ default: 'alignEnd' }} gap={{ default: 'gapMd' }}>
              <ToolbarItem>
                <DebugToggle />
              </ToolbarItem>
              <ToolbarItem>
                <ThemeToggle />
              </ToolbarItem>
              <ToolbarItem>
                <UserMenu />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
}
