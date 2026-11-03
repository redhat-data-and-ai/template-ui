import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch } from '../redux/hooks';
import { addChat, ChatItem } from '../redux/slices/chats';
import { useContent } from '../hooks/useContent';
import { ConfigText } from '../components/ConfigText';
import { InputForm } from '../components/InputForm';
import { Card, CardBody } from '@patternfly/react-core';

export function HomePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const content = useContent();

  // Settled before the first keystroke rather than at submit time, so
  // a file can be attached here and land on the thread the chat will
  // actually become. The agent creates the thread on upload when it
  // does not exist yet, which is exactly this case.
  const [draftChatId] = useState(() => uuidv4());

  const startChat = useCallback(
    (initialPrompt?: string) => {
      const newChatId = draftChatId;
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
    [dispatch, navigate, draftChatId],
  );

  return (
    // One centred column: greeting, prompts, composer. The composer
    // used to live in its own bottom bar with a separate border and
    // background, which read as a second container competing with the
    // chat card and left a wide dead band between the two.
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="max-w-2xl w-full text-center">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-foreground font-bold mb-3" style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)' }}>
              <ConfigText value={content.resolved_greeting} />
            </h1>
            <p className="text-muted-foreground text-base">
              <ConfigText value={content.subtitle} />
            </p>
          </div>

          {/* Quick prompts — hidden entirely when config supplies none */}
          {content.quick_prompts.length > 0 && (
          <div className="mb-6">
            {content.quick_prompts_heading && (
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                <ConfigText value={content.quick_prompts_heading} />
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="list" aria-label="Quick prompt suggestions">
              {content.quick_prompts.map((prompt, index) => {
                // An odd count leaves a lone tile hugging the left of
                // a two-column grid. Upstream's fix: span both and
                // centre at half width.
                const isLastOfOddCount =
                  content.quick_prompts.length % 2 === 1 &&
                  index === content.quick_prompts.length - 1;
                return (
                <div
                  key={prompt}
                  role="listitem"
                  className={isLastOfOddCount ? 'sm:col-span-2 sm:flex sm:justify-center' : undefined}
                >
                  {/* PatternFly Card: its clickable variant brings a
                      real hover and focus treatment. The hand-rolled
                      version was bg-card on bg-background — two greys
                      four points apart, which is not a boundary. */}
                  <Card
                    isClickable
                    isCompact
                    className={`h-full text-left prompt-tile ${
                      isLastOfOddCount ? 'sm:w-[calc(50%-0.3125rem)]' : ''
                    }`}
                    component="div"
                  >
                    <CardBody>
                      <button
                        type="button"
                        onClick={() => startChat(prompt)}
                        aria-label={`Start chat: ${prompt}`}
                        className="w-full text-left text-sm cursor-pointer bg-transparent border-0 p-0"
                      >
                        {prompt}
                      </button>
                    </CardBody>
                  </Card>
                </div>
                );
              })}
            </div>
          </div>
          )}

          {/* The same composer as the conversation, not a second
              implementation of it. The hand-rolled copy that used to
              live here drifted through two rounds of changes to the
              real one and, more to the point, had no attach button —
              so the only way to give the agent a document was to send
              a message first and attach afterwards. */}
          <InputForm
            onSubmit={(value) => startChat(value.trim())}
            onCancel={() => {}}
            isLoading={false}
            threadId={draftChatId}
            placeholder={content.input_placeholder}
            ariaLabel={`Enter a prompt for ${window.APP_DATA?.agentName || 'Agent'}`}
          />
        </div>
      </div>
    </div>
  );
}
