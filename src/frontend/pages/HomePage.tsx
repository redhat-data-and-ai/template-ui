
import { Button } from '../components/ui/button';
import { useChat } from '../contexts/ChatContext';
import { useMemo } from 'react';

export function HomePage() {
  const { createNewChat } = useChat();
  
  // Get user data for personalization
  const userData = useMemo(() => window.USER_DATA, []);
  const userDisplayName = userData?.displayName || userData?.given_name;

  return (
    <main className="flex-1 h-full max-w-4xl mx-auto">
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
          
          {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <div className="p-4 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors">
              <h3 className="font-semibold text-neutral-200 mb-2">📊 Data Analysis</h3>
              <p className="text-sm text-neutral-400">
                Query your databases and get insights from your business data
              </p>
            </div>
            <div className="p-4 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors">
              <h3 className="font-semibold text-neutral-200 mb-2">🔍 Smart Queries</h3>
              <p className="text-sm text-neutral-400">
                Ask natural language questions and get SQL-powered answers
              </p>
            </div>
            <div className="p-4 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors">
              <h3 className="font-semibold text-neutral-200 mb-2">📈 Visualizations</h3>
              <p className="text-sm text-neutral-400">
                Transform your data into beautiful charts and reports
              </p>
            </div>
            <div className="p-4 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors">
              <h3 className="font-semibold text-neutral-200 mb-2">🤖 AI Assistant</h3>
              <p className="text-sm text-neutral-400">
                Get intelligent recommendations and data interpretations
              </p>
            </div>
          </div> */}
          
          <div className="pt-6">
            {/* <p className="text-neutral-500 mb-4">Ready to get started?</p> */}
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
