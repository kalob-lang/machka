import React, { useState, useMemo } from 'react';
import { Modal, Form, Button, Stack } from 'react-bootstrap';
import Fuse from 'fuse.js';
import SearchResultItem from './SearchResultItem';

interface FindReplaceModalProps {
  show: boolean;
  onHide: () => void;
  validSegments: string[];
  translations: Record<string, any>;
  fuzzySearchThreshold: number;
  onConfirmReplace: (replacements: { segment: string, newTarget: string }[]) => void;
  onGoToSegment: (segmentIndex: number) => void;
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FindReplaceModal: React.FC<FindReplaceModalProps> = ({ show, onHide, validSegments, translations, fuzzySearchThreshold, onConfirmReplace, onGoToSegment }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // We need to build a searchable list for Fuse
  // Each item should have the index, segment text (source), and target text
  const searchableData = useMemo(() => {
    return validSegments.map((segment, index) => {
      const translationData = translations[segment];
      const targetText = typeof translationData === 'object' && translationData !== null ? translationData.text : (translationData || '');
      return {
        segment,
        index,
        targetText: targetText || ''
      };
    });
  }, [validSegments, translations]);

  const replaceMode = replaceQuery.length > 0;

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    if (replaceMode) {
      // EXACT MATCH ONLY for replace mode
      const regex = new RegExp(escapeRegExp(searchQuery), 'gi');
      const results: any[] = [];
      searchableData.forEach(item => {
        if (!item.targetText) return;
        let match;
        const targetMatchIndices: [number, number][] = [];
        // regex.exec is stateful with 'g'
        while ((match = regex.exec(item.targetText)) !== null) {
            targetMatchIndices.push([match.index, match.index + match[0].length - 1]);
        }
        if (targetMatchIndices.length > 0) {
            results.push({ item, targetMatchIndices });
        }
      });
      return results;
    } else {
      // FUZZY SEARCH
      const fuse = new Fuse(searchableData, {
        keys: ['targetText'],
        includeMatches: true,
        threshold: fuzzySearchThreshold / 100.0,
        ignoreLocation: true
      });
      const results = fuse.search(searchQuery.trim());
      return results.map(result => {
          let targetMatchIndices: [number, number][] = [];
          
          // First, try exact match to get perfect indices for highlighting if the query exists exactly
          const exactRegex = new RegExp(escapeRegExp(searchQuery.trim()), 'gi');
          let match;
          while ((match = exactRegex.exec(result.item.targetText)) !== null) {
              targetMatchIndices.push([match.index, match.index + match[0].length - 1]);
          }

          // If no exact match found, fall back to fuse.js fuzzy indices
          if (targetMatchIndices.length === 0) {
              result.matches?.forEach(m => {
                  if (m.key === 'targetText') {
                      m.indices.forEach(idx => {
                          targetMatchIndices.push([idx[0], idx[1]]);
                      });
                  }
              });
          }
          
          return { item: result.item, targetMatchIndices };
      });
    }
  }, [searchQuery, searchableData, fuzzySearchThreshold, replaceMode]);

  // Compute replacements for preview
  const replacementsToApply = useMemo(() => {
      if (!replaceMode || !searchQuery) return [];
      
      return searchResults.map(result => {
          const { item, targetMatchIndices } = result;
          let newTarget = item.targetText;
          // Apply replacements from right to left to avoid index shifting
          const sortedIndices = [...targetMatchIndices].sort((a, b) => b[0] - a[0]);
          sortedIndices.forEach(([start, end]) => {
              newTarget = newTarget.substring(0, start) + replaceQuery + newTarget.substring(end + 1);
          });
          return {
              segment: item.segment,
              originalTarget: item.targetText,
              newTarget: newTarget,
              index: item.index,
              targetMatchIndices
          };
      });
  }, [searchResults, replaceMode, replaceQuery, searchQuery]);

  const handleActionClick = () => {
      if (replaceMode) {
          setShowConfirm(true);
      }
  };

  const handleConfirm = () => {
      onConfirmReplace(replacementsToApply.map(r => ({ segment: r.segment, newTarget: r.newTarget })));
      setShowConfirm(false);
      onHide();
      setSearchQuery('');
      setReplaceQuery('');
  };

  return (
    <Modal show={show} onHide={() => { onHide(); setShowConfirm(false); }} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Find and Replace Target Text</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>Find</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Text to search for..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {!replaceMode && <Form.Text className="text-muted">Fuzzy search is active. (Threshold: {fuzzySearchThreshold}%)</Form.Text>}
            {replaceMode && <Form.Text className="text-warning">Replace mode active: only exact matches are supported.</Form.Text>}
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Replace with</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Leave empty to just search..." 
              value={replaceQuery}
              onChange={(e) => {
                  setReplaceQuery(e.target.value);
                  setShowConfirm(false); // reset confirm state when changing replace text
              }}
            />
          </Form.Group>
        </Form>
        
        {showConfirm && replaceMode && (
          <div className="alert alert-danger">
              <strong>Confirm Action:</strong> Are you sure you want to make this change, updating the target text of {replacementsToApply.length} segment(s) in this document?
              <Stack direction="horizontal" gap={2} className="mt-2">
                  <Button variant="danger" onClick={handleConfirm}>Yes, Replace All</Button>
                  <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
              </Stack>
          </div>
        )}

        <hr />
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {searchResults.length === 0 && searchQuery.trim() && (
                <p className="text-muted text-center">No matches found.</p>
            )}
            {replaceMode ? (
                replacementsToApply.map(rep => (
                    <SearchResultItem
                        key={rep.index}
                        segmentNumber={rep.index + 1}
                        sourceText={rep.segment}
                        targetText={rep.originalTarget}
                        targetMatchIndices={rep.targetMatchIndices}
                        isDiffMode={true}
                        replacementText={replaceQuery}
                        onGoToSegment={(idx) => {
                            onHide();
                            setTimeout(() => onGoToSegment(idx), 300);
                        }}
                    />
                ))
            ) : (
                searchResults.map(result => (
                    <SearchResultItem
                        key={result.item.index}
                        segmentNumber={result.item.index + 1}
                        sourceText={result.item.segment}
                        targetText={result.item.targetText}
                        targetMatchIndices={result.targetMatchIndices}
                        onGoToSegment={(idx) => {
                            onHide();
                            setTimeout(() => onGoToSegment(idx), 300);
                        }}
                    />
                ))
            )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => { onHide(); setShowConfirm(false); }}>Close</Button>
        {replaceMode && !showConfirm && (
            <Button variant="primary" onClick={handleActionClick} disabled={replacementsToApply.length === 0}>
                Preview
            </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default FindReplaceModal;
