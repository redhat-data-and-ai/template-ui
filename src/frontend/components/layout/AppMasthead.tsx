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
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { useAppSelector } from '../../redux/hooks';
import type { RootState } from '../../redux/store';

export interface AppMastheadProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function isLinkableUrl(value: string | undefined): value is string {
  if (!value) return false;
  // Same-origin relative path ("/x"), but not protocol-relative ("//host").
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
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
      {emphasis ? <b className="app-masthead-brand__emphasis">{emphasis}</b> : null}
    </>
  );

  return (
    <Masthead display={{ default: 'inline' }}>
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
        <MastheadBrand className="app-masthead-brand-wrap">
          <MastheadLogo component="div" className="app-masthead-brand">
            <Link to="/" aria-label={title} className="app-masthead-brand__link">
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt={title} className="app-masthead-brand__logo" />
              ) : (
                <RedHatLogo className="app-masthead-brand__logo app-masthead-brand__logo--default" />
              )}
            </Link>
            {hasPlatform ? (
              <>
                {isLinkableUrl(branding?.platform_url) ? (
                  <a
                    href={branding?.platform_url}
                    className="app-masthead-brand__platform"
                  >
                    {platformLabel}
                  </a>
                ) : (
                  <span className="app-masthead-brand__platform">{platformLabel}</span>
                )}
                <Divider orientation={{ default: 'vertical' }} className="app-masthead-brand__divider" data-testid="masthead-separator" />
              </>
            ) : null}
            <span
              title={title}
              className="app-masthead-brand__title"
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
