import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedbackType: "positive" | "negative";
  messageId: string;
  traceId: string;
  onSubmit: (traceId: string, feedbackType: "positive" | "negative", comment: string) => void;
}

export function FeedbackModal({
  isOpen,
  onClose,
  feedbackType,
  messageId,
  traceId,
  onSubmit,
}: FeedbackModalProps) {
  const [comment, setComment] = useState("");

  const handleSubmit = () => {
    onSubmit(traceId, feedbackType, comment);
    setComment("");
    onClose();
  };

  const handleCancel = () => {
    setComment("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {feedbackType === "positive" ? "Provide positive feedback" : "Provide feedback"}
          </DialogTitle>
          <DialogDescription>
            {feedbackType === "positive"
              ? "What did you like about this response?"
              : "What could be improved about this response?"}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Add your comment (optional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[120px] bg-neutral-900 border-neutral-700 text-neutral-100 placeholder:text-neutral-500"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleSubmit}>
            Submit
          </Button>
          <Button onClick={handleCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}