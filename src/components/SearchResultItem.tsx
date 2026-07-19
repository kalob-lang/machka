import React from 'react';
import { Card, Button } from 'react-bootstrap';

export interface SearchResultItemProps {
  segmentNumber: number;
  sourceText: string;
  targetText: string;
  targetMatchIndices: [number, number][]; // [start, end] inclusive
  sourceMatchIndices?: [number, number][]; // [start, end] inclusive
  isDiffMode?: boolean;
  replacementText?: string;
  onGoToSegment?: (segmentIndex: number) => void;
}

// Helper to merge overlapping indices
const mergeIndices = (indices: [number, number][]): [number, number][] => {
  if (indices.length === 0) return [];
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }
  return merged;
};

export const HighlightedText: React.FC<{ text: string, indices: [number, number][], replacementText?: string, isDiffMode?: boolean }> = ({ text, indices, replacementText, isDiffMode }) => {
  if (indices.length === 0) return <span>{text}</span>;

  const mergedIndices = mergeIndices(indices);
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;

  mergedIndices.forEach(([start, end], idx) => {
    if (currentIndex < start) {
      parts.push(<span key={`text-${idx}`}>{text.slice(currentIndex, start)}</span>);
    }
    const matchedStr = text.slice(start, end + 1);
    if (isDiffMode && replacementText !== undefined) {
      parts.push(
        <span key={`match-${idx}`}>
          <del className="text-danger">{matchedStr}</del>
          <ins className="text-success ms-1">{replacementText}</ins>
        </span>
      );
    } else {
      parts.push(<strong key={`match-${idx}`}>{matchedStr}</strong>);
    }
    currentIndex = end + 1;
  });

  if (currentIndex < text.length) {
    parts.push(<span key={`text-end`}>{text.slice(currentIndex)}</span>);
  }

  return <>{parts}</>;
};

const SearchResultItem: React.FC<SearchResultItemProps> = ({ segmentNumber, sourceText, targetText, targetMatchIndices, sourceMatchIndices, isDiffMode, replacementText, onGoToSegment }) => {
  return (
    <Card className="mb-2 border-0 shadow-sm">
      <Card.Header className="py-1 bg-light border-0 d-flex justify-content-between align-items-center">
        <small className="fw-bold text-secondary">Segment {segmentNumber}</small>
        {onGoToSegment && (
          <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={() => onGoToSegment(segmentNumber - 1)}>
            Go to segment
          </Button>
        )}
      </Card.Header>
      <Card.Body className="py-2">
        <div className="mb-1">
          <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Source:</small>
          <HighlightedText text={sourceText} indices={sourceMatchIndices || []} />
        </div>
        <div>
          <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Target:</small>
          <HighlightedText text={targetText} indices={targetMatchIndices} replacementText={replacementText} isDiffMode={isDiffMode} />
        </div>
      </Card.Body>
    </Card>
  );
};

export default SearchResultItem;
