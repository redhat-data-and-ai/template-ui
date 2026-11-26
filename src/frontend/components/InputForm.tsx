import { forwardRef } from "react";
import { ChatComposer, type ChatComposerProps } from "./chat/ChatComposer";

type InputFormProps = Pick<
  ChatComposerProps,
  "onSubmit" | "isLoading" | "isRateLimited" | "rateLimitRemainingSeconds"
> & { onCancel: () => void };

/** Conversation composer; kept as the export name used by the chat views. */
export const InputForm = forwardRef<HTMLTextAreaElement, InputFormProps>(function InputForm(props, ref) {
  return (
    <div className="p-3 pb-4">
      <ChatComposer ref={ref} {...props} />
    </div>
  );
});
