import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface SegmentationPreviewModalProps {
  show: boolean;
  onHide: () => void;
  content: string;
  rule: string;
  originalRule: string;
  cancelTriggers: string[];
  originalCancelTriggers: string[];
  onExecute: () => void;
}

const SegmentationPreviewModal: React.FC<SegmentationPreviewModalProps> = ({ show, onHide, content, rule, originalRule, cancelTriggers, originalCancelTriggers, onExecute }) => {
  const [visibleCount, setVisibleCount] = useState(100);
  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({ threshold: 0.1 });

  useEffect(() => {
    if (isIntersecting) {
      setVisibleCount(prev => prev + 100);
    }
  }, [isIntersecting]);

  useEffect(() => {
    if (show) {
      // Reset visible count when modal is opened
      setVisibleCount(100);
    }
  }, [show]);

  const hasChanges = rule !== originalRule || cancelTriggers.join('\n') !== originalCancelTriggers.join('\n');

  const highlightedContent = useMemo(() => {
    if (!show) return null;

    try {
      const wrappedRule = `(${rule})`;
      const regex = new RegExp(wrappedRule, 'g');
      const parts = content.split(regex);
      
      const triggers = cancelTriggers?.filter(t => t.trim() !== '') || [];
      
      let segments: string[] = [];
      let delimiters: string[] = [];
      
      if (triggers.length === 0) {
        segments = parts.filter((_, i) => i % 2 === 0);
        delimiters = parts.filter((_, i) => i % 2 !== 0);
      } else {
        let currentSegment = parts[0] || '';
        for (let i = 1; i < parts.length; i += 2) {
          const delimiter = parts[i];
          const nextSegment = parts[i + 1] || '';
          
          const textSoFar = currentSegment + delimiter;
          const trimmedSoFar = textSoFar.trimEnd();
          const segmentTrimmed = currentSegment.trimEnd();
          
          let isCancelled = false;
          for (const trigger of triggers) {
            if (trimmedSoFar.endsWith(trigger) || segmentTrimmed.endsWith(trigger)) {
              isCancelled = true;
              break;
            }
          }
          
          if (isCancelled) {
            currentSegment = textSoFar + nextSegment;
          } else {
            segments.push(currentSegment);
            delimiters.push(delimiter);
            currentSegment = nextSegment;
          }
        }
        segments.push(currentSegment);
      }

      const highlighted = segments.slice(0, visibleCount).reduce<React.ReactNode[]>((acc, segment, index) => {
        const delimiter = delimiters[index] || '';
        const color = `hsl(${(index * 60) % 360}, 100%, 75%)`;
        return [...acc, <span key={index} style={{ backgroundColor: color }}>{segment}</span>, delimiter];
      }, []);

      return (
        <>
          {highlighted}
          {segments.length > visibleCount && <div ref={sentinelRef} style={{ height: '1px' }} />} 
        </>
      );
    } catch (error) {
      return <div className="alert alert-danger">Invalid regular expression.</div>;
    }
  }, [content, rule, cancelTriggers, show, visibleCount, sentinelRef]);

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Segmentation Preview</Modal.Title>
      </Modal.Header>
      <Modal.Body 
        id='segmentation-preview-modal-body' 
        style={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        {highlightedContent}
      </Modal.Body>
      <Modal.Footer>
        {!hasChanges && <span>No rule change</span>}
        <Button variant="secondary" onClick={onHide}>Close</Button>
        {hasChanges && <Button variant="danger" onClick={onExecute}>Execute</Button>}
      </Modal.Footer>
    </Modal>
  );
}

export default SegmentationPreviewModal;