import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ChatWelcome } from '../components/chat/ChatWelcome';
import { ChatComposer } from '../components/chat/ChatComposer';
import { useAppDispatch } from '../redux/hooks';
import { addChat, ChatItem } from '../redux/slices/chats';
import { markChatAsClientCreated } from '../services/newChatTracker';
import './pages.css';

function builtinQuickPrompts(): string[] {
  return [
    // No agent name: it is operator-chosen and the model reads it as an entity to look up.
    'What can you do for me?',
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
      markChatAsClientCreated(newChatId);
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

  return (
    <div className="app-home">
      {/* Center content area */}
      <div className="app-home__center">
        <ChatWelcome
          userName={userDisplayName || 'there'}
          agentTitle={window.APP_DATA?.agentName || 'Agent'}
          prompts={prompts}
          onPrompt={(prompt) => startChat(prompt)}
        />
      </div>

      {/* Bottom input bar */}
      <div className="app-home__composer">
        <div className="app-home__composer-inner">
          <ChatComposer
            id="home-chat-input"
            formLabel="Start a new chat"
            inputLabel={`Enter a prompt for ${window.APP_DATA?.agentName || 'Agent'}`}
            placeholder={`Enter a prompt for ${window.APP_DATA?.agentName || 'Agent'}`}
            onSubmit={(value) => startChat(value.trim())}
          />
        </div>
      </div>
    </div>
  );
}
