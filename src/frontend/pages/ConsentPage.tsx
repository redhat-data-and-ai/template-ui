import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';

export function ConsentPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/auth/consent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error('Failed to approve consent');
      }

      const data = await response.json();
      navigate(data.redirectUrl ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeny = () => {
    setError(
      'You must approve the authorization to continue using this application.',
    );
  };

  return (
    <div className="w-full min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-card rounded-xl shadow-elevated border border-border animate-fadeInUp">
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Authorization Required
            </h1>
            <p className="text-muted-foreground">
              This application needs your permission before you continue
            </p>
          </div>

          {/* AI Technology Usage Notice */}
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-foreground mb-3">
              AI Technology Usage Notice
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You are about to use a Red Hat tool that utilizes AI technology to
              provide you with relevant information. By proceeding to use the
              tool, you acknowledge that the tool and any output provided are
              only intended for internal use and that information should only be
              shared with those with a legitimate business purpose. Responses
              provided by tools utilizing AI technology should be reviewed and
              verified prior to use.
            </p>
          </div>

          {/* Permissions */}
          <div className="space-y-4 mb-6">
            <div className="bg-secondary rounded-lg p-4 border border-border">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
                  Your SSO token will be used to authenticate with connected
                  platforms (e.g. Snowflake, Jira, GitLab, or other integrated
                  services)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
                  Execute actions on your behalf through configured MCP tools
                  and skills
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
                  Read and process data returned by those platforms to generate
                  insights
                </li>
              </ul>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-medium text-foreground mb-1">
                    Important:
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Actions performed by this agent are executed under your
                    identity. You will be able to review and approve individual
                    tool calls during your session, and you can revoke consent at
                    any time from your settings.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4"
              role="alert"
            >
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDeny}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed font-medium text-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Approving…
                </>
              ) : (
                'Approve & Continue'
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              By approving, you allow this agent to use your authenticated
              session to interact with connected platforms on your behalf. Your
              queries and results may be logged for governance and product
              improvement purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
