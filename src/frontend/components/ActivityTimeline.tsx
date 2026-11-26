import { ExpandableSection, List, ListItem, Spinner } from "@patternfly/react-core";
import {
  BrainIcon,
  InfoCircleIcon,
  OutlinedCommentsIcon,
  PenIcon,
  SearchIcon,
  ListIcon,
} from "@patternfly/react-icons";
import { useEffect, useState } from "react";
import "./progress.css";

export interface ProcessedEvent {
  title: string;
  data: unknown;
}

interface ActivityTimelineProps {
  processedEvents: ProcessedEvent[];
  isLoading: boolean;
}

function eventIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("generating")) return <OutlinedCommentsIcon />;
  if (t.includes("thinking")) return <Spinner size="sm" aria-label="Thinking" />;
  if (t.includes("reflection")) return <BrainIcon />;
  if (t.includes("research")) return <SearchIcon />;
  if (t.includes("finalizing")) return <PenIcon />;
  return <ListIcon />;
}

function formatData(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return (data as string[]).join(", ");
  return JSON.stringify(data);
}

export function ActivityTimeline({ processedEvents, isLoading }: ActivityTimelineProps) {
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoading && processedEvents.length !== 0) {
      setIsTimelineCollapsed(true);
    }
  }, [isLoading, processedEvents]);

  const searching = (key: string) => (
    <ListItem key={key} icon={<Spinner size="sm" aria-label="Searching" />}>
      <span className="app-timeline__title">Searching...</span>
    </ListItem>
  );

  return (
    <div className="app-timeline">
      <ExpandableSection
        toggleText="Research"
        isExpanded={!isTimelineCollapsed}
        onToggle={(_e, isOpen) => setIsTimelineCollapsed(!isOpen)}
      >
        <div className="app-timeline__body">
          {processedEvents.length > 0 || isLoading ? (
            <List isPlain className="app-timeline__list">
              {isLoading && processedEvents.length === 0 && searching("initial")}
              {processedEvents.map((eventItem, index) => (
                <ListItem key={index} icon={eventIcon(eventItem.title)}>
                  <span className="app-timeline__title">{eventItem.title}</span>
                  <span className="app-timeline__data">{formatData(eventItem.data)}</span>
                </ListItem>
              ))}
              {isLoading && processedEvents.length > 0 && searching("trailing")}
            </List>
          ) : (
            <div className="app-timeline__empty">
              <InfoCircleIcon />
              <p>No activity to display.</p>
              <p className="app-timeline__hint">Timeline will update during processing.</p>
            </div>
          )}
        </div>
      </ExpandableSection>
    </div>
  );
}
