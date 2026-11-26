import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Tooltip } from '@patternfly/react-core';

interface TruncationTooltip {
  /** Attach to the element whose text may be ellipsized. */
  textRef: RefObject<HTMLSpanElement | null>;
  /** Spread onto the interactive parent (link) so hover and focus both work. */
  handlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  /** Render next to the text; shows the full text only while truncated. */
  tooltip: ReactNode;
}

/** PF Tooltip with the full text, shown only when the text is actually cut off. */
export function useTruncationTooltip(text: string): TruncationTooltip {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);

  const show = () => {
    const el = textRef.current;
    setVisible(Boolean(el && el.scrollWidth > el.clientWidth));
  };
  const hide = () => setVisible(false);

  return {
    textRef,
    handlers: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide },
    tooltip: (
      <Tooltip content={text} triggerRef={textRef} trigger="manual" isVisible={visible} position="right" />
    ),
  };
}
