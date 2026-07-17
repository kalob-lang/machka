import React, { useEffect, useRef, useMemo } from 'react';
import Mark from 'mark.js';
import { useApp } from '../AppContext';

interface UnderlinedTextProps {
  text: string;
  memories: Record<string, string>;
  onMemoryClick: (sourceText: string, rect: DOMRect) => void;
  onMemoriesNumbered: (memories: Record<number, { source: string, target: string }>) => void;
  memoryVersion: number;
}

const UnderlinedText: React.FC<UnderlinedTextProps> = ({ text, memories, onMemoryClick, onMemoriesNumbered, memoryVersion }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const { autocomplete } = useApp();

  const memoryMap = useMemo(() => {
    const resolved: Record<string, { target: string, isAlternative: boolean }> = {};

    // First, map all main memories
    for (const key in memories) {
      const value = memories[key];
      if (!value.startsWith('@')) {
        resolved[key] = { target: value, isAlternative: false };
      }
    }

    // Second, map all alternatives, looking up their main target
    for (const key in memories) {
      const value = memories[key];
      if (value.startsWith('@')) {
        const mainKey = value.substring(1);
        const mainMemoryValue = memories[mainKey];
        if (mainMemoryValue && !mainMemoryValue.startsWith('@')) {
          resolved[key] = { target: mainMemoryValue, isAlternative: true };
        }
      }
    }
    return resolved;
  }, [memories]);

  const badges: HTMLElement[] = [];

  useEffect(() => {
    const handleMarkClick = (event: MouseEvent) => {
      const target = event.currentTarget as HTMLElement;
      const sourceText = target.dataset.source;
      if (sourceText) {
        onMemoryClick(sourceText, target.getBoundingClientRect());
      }
    };

    const instance = new Mark(textRef.current as HTMLElement);
    const memoryKeys = Object.keys(memoryMap).filter(key => key.length > 0);
    
    instance.unmark({
      done: () => {
        // clear existing badges
        for (let badge in badges) { badges[badge].remove(); delete badges[badge] }

        const sourceTextToNumberMap: Record<string, number> = {};
        let memoryCounter = 1;

        if (memoryKeys.length > 0) {
          instance.mark(memoryKeys, {
            separateWordSearch: false,
            accuracy: 'exactly',
            className: 'memory-highlight',
            exclude: ['sup'],
            each: (el) => {
              const sourceText = el.textContent || '';
              const memory = memoryMap[sourceText];
              if (memory && el instanceof HTMLElement) {
                el.dataset.source = sourceText;
                el.dataset.target = memory.target;
                el.dataset.isAlternative = String(memory.isAlternative);
                el.title = memory.target; // Use title attribute for simple tooltip
                el.addEventListener('click', handleMarkClick);

                if (autocomplete) {
                  if (sourceTextToNumberMap[sourceText] === undefined) {
                    sourceTextToNumberMap[sourceText] = memoryCounter++;
                  }
                  const number = sourceTextToNumberMap[sourceText];
                  el.dataset.number = String(number);
                }
              }
            }
          });
        }

        const numberedMemories: Record<number, { source: string, target: string }> = {};
        for (const sourceText in sourceTextToNumberMap) {
          const number = sourceTextToNumberMap[sourceText];
          const memory = memoryMap[sourceText];
          if (number && memory) {
            numberedMemories[number] = {
              source: sourceText,
              target: memory.target
            };
          }
        }
        onMemoriesNumbered(numberedMemories);
      }
    });

    return () => {
      const markedElements = textRef.current?.querySelectorAll('.memory-highlight');
      markedElements?.forEach(el => {
        if (el instanceof HTMLElement)
          el.removeEventListener('click', handleMarkClick);
      });
    };
  }, [text, memoryMap, onMemoriesNumbered, autocomplete, memoryVersion, onMemoryClick]);

  return (
    <span id="current-editing-translation-source-text">
      <span ref={textRef} className="source-text">{text}</span>
    </span>
  );
};

export default UnderlinedText;