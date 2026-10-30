import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch } from '../redux/hooks';
import { addChat, ChatItem } from '../redux/slices/chats';
import { InputForm } from '../components/InputForm';

function builtinQuickPrompts(): string[] {
  const agentName = window.APP_DATA?.agentName || 'Agent';
  return [
    `What can ${agentName} do for me?`,
    'Help me analyze a dataset',
    'Write a query to find anomalies',
    'Summarize the key findings from this data',
  ];
}

function quickPrompts(): string[] {
  const configured = (window.APP_DATA?.quickPrompts ?? [])
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt.length > 0)
    .filter((prompt, index, all) => all.indexOf(prompt) === index);
  return configured.length > 0 ? configured : builtinQuickPrompts();
}

export function HomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const userData = useMemo(() => window.USER_DATA, []);
  const userDisplayName = userData?.displayName || userData?.given_name;
  const prompts = useMemo(() => quickPrompts(), []);

  const startChat = useCallback(
    (initialPrompt?: string) => {
      const newChatId = uuidv4();
      const newChat: ChatItem = {
        id: newChatId,
        title: initialPrompt?.substring(0, 40) || 'New Chat',
        timestamp: new Date().toISOString(),
        preview: initialPrompt || 'Start a new conversation',
        messages: [],
        historicalActivities: {},
        feedback: {},
      };
      dispatch(addChat(newChat));
      navigate(`/chat/${newChatId}`, { state: { initialPrompt: initialPrompt } });
    },
    [dispatch, navigate],
  );

  const promptLabel = `Enter a prompt for ${window.APP_DATA?.agentName || 'Agent'}`;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Center content area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl w-full text-center">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-foreground font-bold mb-3" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
              {userDisplayName ? (
                <>Hey {userDisplayName}! <span aria-hidden="true">👋</span></>
              ) : (
                <>Hey there! <span aria-hidden="true">👋</span></>
              )}
            </h1>
            <p className="text-muted-foreground text-base">
              <span className="font-medium text-foreground">{window.APP_DATA?.agentName || 'Agent'}</span> is ready to help. What would you like to explore today?
            </p>
          </div>

          {/* Quick prompts */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">
              Let&apos;s try some quick prompts <span aria-hidden="true">🚀</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="list" aria-label="Quick prompt suggestions">
              {prompts.map((prompt, index) => {
                const isLastOfOddCount = prompts.length % 2 === 1 && index === prompts.length - 1;
                return (
                  <div
                    key={prompt}
                    role="listitem"
                    className={isLastOfOddCount ? 'sm:col-span-2 sm:flex sm:justify-center' : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => startChat(prompt)}
                      aria-label={`Start chat: ${prompt}`}
                      className={`text-left p-3.5 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors cursor-pointer w-full ${
                        isLastOfOddCount ? 'sm:w-[calc(50%-0.3125rem)]' : ''
                      }`}
                    >
                      <p className="text-sm text-foreground/90">{prompt}</p>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom input bar */}
      <div className="border-t border-border bg-background px-6 pb-4 pt-3">
        <div className="max-w-2xl mx-auto">
          <InputForm
            onSubmit={(value) => startChat(value.trim())}
            onCancel={() => {}}
            isLoading={false}
            placeholder={promptLabel}
            inputLabel={promptLabel}
          />
        </div>
      </div>
    </div>
  );
}
