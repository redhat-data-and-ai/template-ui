import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../components/ui/button';
import { useAppDispatch } from '../redux/hooks';
import { addChat, ChatItem } from '../redux/slices/chats';

export function HomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const userData = useMemo(() => window.USER_DATA, []);
  const userDisplayName = userData?.displayName || userData?.given_name;

  const handleNewChat = useCallback(() => {
    const newChatId = uuidv4();
    const newChat: ChatItem = {
      id: newChatId,
      title: 'New Chat',
      timestamp: new Date().toISOString(),
      preview: 'Start a new conversation',
      messages: [],
      historicalActivities: {},
    };
    dispatch(addChat(newChat));
    navigate(`/chat/${newChatId}`);
  }, [dispatch, navigate]);

  return (
    <main className="flex-1 h-full max-w-4xl mx-auto">
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-neutral-100">
              {userDisplayName ? `How can I help you today, ${userDisplayName}?` : 'How can I help you today?'}
            </h1>
            <p className="text-lg text-neutral-400">
              Ask me anything and I'll help you with AI-powered insights.
            </p>
          </div>

          <div className="pt-6">
            <Button
              onClick={handleNewChat}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Start New Chat
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
