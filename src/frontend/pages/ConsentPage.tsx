import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  Content,
  Flex,
  Title,
} from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import { RedHatLogo } from '../components/RedHatLogo';
import { buildAppPath } from '../lib/app-paths';
import './consent.css';

export function ConsentPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsSubmitting(true);
    setError(null);

    const maxRetries = 3;
    const baseDelay = 1000;

    for(let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(buildAppPath('/auth/consent/approve'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });

        if (response.ok) {
          const data = await response.json();
          navigate(data.redirectUrl ?? '/', { replace: true });
          return;
        }

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
          continue;
        }

        throw new Error('Failed to approve consent');
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
          continue;
        }
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }

    setIsSubmitting(false);
  };

  const permissions = [
    'Your SSO token will be used to authenticate with connected platforms (e.g. Snowflake, Jira, GitLab, or other integrated services)',
    'Execute actions on your behalf through configured MCP tools and skills',
    'Read and process data returned by those platforms to generate insights',
  ];

  return (
    <Bullseye component="main" className="app-consent">
      <Card className="app-consent__card">
        <CardBody className="pf-v6-u-p-xl">
          <Flex
            direction={{ default: 'column' }}
            gap={{ default: 'gapLg' }}
            alignItems={{ default: 'alignItemsStretch' }}
          >
            <Flex
              direction={{ default: 'column' }}
              gap={{ default: 'gapSm' }}
              alignItems={{ default: 'alignItemsCenter' }}
            >
              <RedHatLogo className="app-consent__logo" />
              <Title headingLevel="h1" size="2xl" className="app-consent__center">
                Authorization Required
              </Title>
              <Content component="p" className="app-consent__center">
                This application needs your permission before you continue
              </Content>
            </Flex>

            <Alert component="h2" variant="info" isInline title="AI Technology Usage Notice">
              You are about to use a Red Hat tool that utilizes AI technology to
              provide you with relevant information. By proceeding to use the
              tool, you acknowledge that the tool and any output provided are
              only intended for internal use and that information should only be
              shared with those with a legitimate business purpose. Responses
              provided by tools utilizing AI technology should be reviewed and
              verified prior to use.
            </Alert>

            <ul className="app-consent__list" aria-label="Permissions">
              {permissions.map((text) => (
                <li key={text}>
                  <CheckCircleIcon aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            <Alert component="h2" variant="warning" isInline title="Important">
              Actions performed by this agent are executed under your identity.
              You will be able to review and approve individual tool calls
              during your session, and you can revoke consent at any time from
              your settings.
            </Alert>

            {error && (
              <Alert component="h2" variant="danger" isInline title={error} role="alert" />
            )}

            <Button
              variant="primary"
              isBlock
              onClick={handleApprove}
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
            >
              {isSubmitting ? 'Acknowledging…' : 'Acknowledge & Proceed'}
            </Button>

            <Content component="small" className="app-consent__footer">
              By acknowledging, you allow this agent to use your authenticated
              session to interact with connected platforms on your behalf.
            </Content>
          </Flex>
        </CardBody>
      </Card>
    </Bullseye>
  );
}
