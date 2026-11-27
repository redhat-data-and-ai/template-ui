import { forwardRef } from "react";
import "./chat/chat-view.css";
import { ChatComposer, type ChatComposerProps } from "./chat/ChatComposer";

type InputFormProps = Pick<
  ChatComposerProps,
  "onSubmit" | "isLoading" | "isRateLimited" | "rateLimitRemainingSeconds"
> & { onCancel: () => void };

/** Conversation composer; kept as the export name used by the chat views. */
export const InputForm = forwardRef<HTMLTextAreaElement, InputFormProps>(function InputForm(props, ref) {
  return (
    <div className="app-chat-composer-pad">
      <ChatComposer ref={ref} {...props} />
    </div>
  );
});
