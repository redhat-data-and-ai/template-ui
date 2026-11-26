import { Card, CardBody, CardHeader, CardTitle, Gallery } from "@patternfly/react-core";
import { ChatbotWelcomePrompt } from "@patternfly/chatbot/dist/esm/ChatbotWelcomePrompt";
import "./chat-welcome.css";

export interface ChatWelcomeProps {
  userName: string;
  agentTitle: string;
  prompts: string[];
  onPrompt: (prompt: string) => void;
}

export function ChatWelcome({ userName, agentTitle, prompts, onPrompt }: ChatWelcomeProps) {
  return (
    <div className="chat-welcome">
      <ChatbotWelcomePrompt
        // PF types these as string but renders them inside spans; nodes are safe.
        title={
          (
            <>
              Hey {userName}! <span aria-hidden="true">👋</span>
            </>
          ) as unknown as string
        }
        description={
          (
            <>
              <b>{agentTitle}</b> is ready to help. What would you like to explore today?
            </>
          ) as unknown as string
        }
      />
      <h2 className="chat-welcome__subheading">
        Let&apos;s try some quick prompts <span aria-hidden="true">🚀</span>
      </h2>
      <Gallery
        hasGutter
        className="chat-welcome__gallery"
        role="list"
        aria-label="Quick prompt suggestions"
        minWidths={{ default: "100%", md: "calc(50% - var(--pf-t--global--spacer--md))" }}
      >
        {prompts.map((prompt, index) => (
          <Card
            key={prompt}
            isClickable
            role="listitem"
            className="chat-welcome__card"
            id={`welcome-prompt-${index}`}
          >
            <CardHeader
              selectableActions={{
                onClickAction: () => onPrompt(prompt),
                selectableActionId: `welcome-prompt-action-${index}`,
                selectableActionAriaLabel: `Start chat: ${prompt}`,
              }}
            >
              <CardTitle>
                <span className="chat-welcome__card-text">{prompt}</span>
              </CardTitle>
            </CardHeader>
            <CardBody hidden />
          </Card>
        ))}
      </Gallery>
    </div>
  );
}
