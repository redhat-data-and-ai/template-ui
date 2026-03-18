import { useState, useEffect } from "react";
import { CheckCircle, XCircle, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PendingPlan } from "../hooks/useDataStream";

interface PlanApprovalCardProps {
  readonly plan: PendingPlan;
  readonly onApprove: (subqueries: string[]) => void;
  readonly onReject: () => void;
}

export function PlanApprovalCard({ plan, onApprove, onReject }: PlanApprovalCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedQueries, setEditedQueries] = useState<string[]>(plan.subqueries);

  useEffect(() => {
    setEditedQueries(plan.subqueries);
  }, [plan.subqueries]);

  const handleQueryChange = (index: number, value: string) => {
    setEditedQueries(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleRemoveQuery = (index: number) => {
    setEditedQueries(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddQuery = () => {
    setEditedQueries(prev => [...prev, ""]);
  };

  const handleApprove = () => {
    const filtered = editedQueries.filter(q => q.trim().length > 0);
    if (filtered.length > 0) {
      onApprove(filtered);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-950/40 to-indigo-900/20 border border-indigo-500/30 rounded-2xl p-6 mb-4 shadow-lg shadow-indigo-950/20">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20">
          <ListChecks className="w-4.5 h-4.5 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-indigo-100">Research Plan Approval</h3>
          <p className="text-xs text-indigo-400/70 mt-0.5">
            Review the plan before research begins
          </p>
        </div>
        <span className="ml-auto px-2.5 py-1 rounded-full bg-indigo-500/15 text-xs font-medium text-indigo-300 border border-indigo-500/20">
          {editedQueries.length} subqueries
        </span>
      </div>

      {plan.understanding && (
        <div className="mb-5 rounded-xl bg-neutral-800/60 border border-neutral-700/50 p-4">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
            Query Understanding
          </p>
          <div className="text-sm text-neutral-200 leading-relaxed prose prose-invert prose-sm max-w-none [&_ul]:mt-1 [&_ul]:mb-0 [&_li]:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {plan.understanding}
            </ReactMarkdown>
          </div>
        </div>
      )}

      <div className="mb-5">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Subqueries
        </p>
        <div className="space-y-2">
          {editedQueries.map((query, idx) => (
            <div key={idx} className="flex items-center gap-3 group">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/15 text-xs font-medium text-indigo-300 shrink-0">
                {idx + 1}
              </span>
              {isEditing ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(idx, e.target.value)}
                    className="flex-1 bg-neutral-800/80 border border-neutral-600/60 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none transition-colors"
                    placeholder="Enter subquery..."
                  />
                  <button
                    onClick={() => handleRemoveQuery(idx)}
                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                    title="Remove subquery"
                    aria-label={`Remove subquery ${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-sm text-neutral-200 leading-relaxed">{query}</span>
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <button
            onClick={handleAddQuery}
            className="flex items-center gap-1.5 mt-3 ml-9 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add subquery
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5 pt-4 border-t border-indigo-500/15">
        <button
          onClick={handleApprove}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <CheckCircle className="w-4 h-4" />
          Approve & Start Research
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="flex items-center gap-2 px-4 py-2.5 bg-neutral-700/80 hover:bg-neutral-600 text-neutral-200 text-sm font-medium rounded-lg transition-colors"
        >
          <Pencil className="w-4 h-4" />
          {isEditing ? "Done Editing" : "Edit Plan"}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-2 px-4 py-2.5 text-red-400/80 hover:text-red-300 hover:bg-red-400/10 text-sm font-medium rounded-lg transition-colors ml-auto"
        >
          <XCircle className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
