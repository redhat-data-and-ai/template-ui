
import { Button } from '../components/ui/button';
import { useChat } from '../contexts/ChatContext';
import { useMemo } from 'react';

export function HomePage() {
  const { createNewChat } = useChat();
  
  // Get user data for personalization
  const userData = useMemo(() => window.USER_DATA, []);
  const userDisplayName = userData?.name || userData?.given_name;

  return (
    <main className="flex-1 h-full w-full">
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-neutral-100">
              {userDisplayName ? `How can I help you today, ${userDisplayName}?` : 'How can I help you today?'}
            </h1>
            <p className="text-lg text-neutral-400">
              Ask me anything about your data and I'll help you analyze it with AI-powered insights.
            </p>
          </div>

          <div className="pt-6">
            <Button 
              onClick={createNewChat}
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
