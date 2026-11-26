export const DEFAULT_DISCLAIMER_TEXT =
  'You are interacting with an AI tool. Always review AI-generated content prior to use.';

interface DisclaimerBannerProps {
  text?: string;
}

export function DisclaimerBanner({ text = DEFAULT_DISCLAIMER_TEXT }: DisclaimerBannerProps) {
  return (
    <div className="app-disclaimer-slot">
      <div className="app-disclaimer-banner" role="note">
        <p className="app-disclaimer-banner__text">{text}</p>
      </div>
    </div>
  );
}
