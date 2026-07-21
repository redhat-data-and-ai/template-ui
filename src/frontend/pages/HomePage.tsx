import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Send } from 'lucide-react';
import { useAppDispatch } from '../redux/hooks';
import { addChat, ChatItem } from '../redux/slices/chats';

const QUICK_PROMPTS = [
  `What can ${window.APP_DATA?.agentName || 'Agent'} do for me?`,
  'Help me analyze a dataset',
  'Write a query to find anomalies',
  'Summarize the key findings from this data',
];

export function HomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');

  const userData = useMemo(() => window.USER_DATA, []);
  const userDisplayName = userData?.displayName || userData?.given_name;

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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;
    startChat(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

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
              {QUICK_PROMPTS.map((prompt) => (
                <div key={prompt} role="listitem">
                  <button
                    type="button"
                    onClick={() => startChat(prompt)}
                    aria-label={`Start chat: ${prompt}`}
                    className="w-full text-left p-3.5 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors cursor-pointer"
                  >
                    <p className="text-sm text-foreground/90">{prompt}</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom input bar */}
      <div className="border-t border-border bg-background px-6 pb-4 pt-3">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} aria-label="Start a new chat">
            <div className="relative rounded-2xl border border-border bg-card shadow-card focus-within:border-primary/40 focus-within:shadow-elevated transition-all duration-200">
              <label htmlFor="home-chat-input" className="sr-only">
                Enter a prompt for {window.APP_DATA?.agentName || 'Agent'}
              </label>
              <textarea
                id="home-chat-input"
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Enter a prompt for ${window.APP_DATA?.agentName || 'Agent'}`}
                className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed min-h-[44px] max-h-[120px] px-4 py-3 pr-12 rounded-2xl placeholder:opacity-60 focus:outline-none focus:ring-0 focus:border-transparent focus:shadow-none"
                style={{ boxShadow: 'none' }}
                rows={1}
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                aria-label="Send message"
                className={`absolute right-2.5 bottom-2.5 flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                  inputValue.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            AI can make mistakes. Please review AI-generated content prior to use.
          </p>
        </div>
      </div>
    </div>
  );
}
