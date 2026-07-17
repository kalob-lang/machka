import React, { useState } from 'react';
import { Button, Form, Stack, Dropdown, Badge } from 'react-bootstrap';
import { useApp } from '../AppContext';

export interface Occurrence {
  segmentIndex: number;
  text: string;
  isTranslated: boolean;
}

interface SelectionTooltipProps {
  x: number;
  y: number;
  text: string;
  onAddMemory: () => void;
  onSaveMemory: (target: string) => void;
  onWiktionarySearch: (term: string) => void;
  isAddingMemory: boolean;
  occurrences?: Occurrence[];
  onNavigate?: (index: number) => void;
  existingMemoryTarget?: string;
  onGoToMemory?: () => void;
  onInsertMemory?: () => void;
}

const SelectionTooltip = React.forwardRef<HTMLDivElement, SelectionTooltipProps>(({ x, y, text, onAddMemory, onSaveMemory, onWiktionarySearch, isAddingMemory, occurrences = [], onNavigate, existingMemoryTarget, onGoToMemory, onInsertMemory }, ref) => {
  const [target, setTarget] = useState('');
  const { wiktionarySearch } = useApp();

  const handleWiktionarySearch = () => {
    if (wiktionarySearch === 'modal') {
      onWiktionarySearch(text);
    } else {
      window.open(`https://en.wiktionary.org/wiki/${text}`, '_blank');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSaveMemory(target);
    }
  };

  if (isAddingMemory) {
    return (
      <div ref={ref} style={{ position: 'absolute', top: y, left: x, zIndex: 1000, backgroundColor: 'white', border: '1px solid black', padding: '5px' }}>
        <Form.Control 
          type="text" 
          placeholder="Enter Target Translation" 
          value={target} 
          onChange={(e) => setTarget(e.target.value)} 
          onKeyDown={handleKeyDown}
        />
        <Button size="sm" onClick={() => onSaveMemory(target)} className="mt-1">Save</Button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'absolute', top: y, left: x, zIndex: 1000, backgroundColor: 'white', border: '1px solid black', padding: '5px' }}>
      <Stack direction='horizontal' gap={1}>
        {onInsertMemory && (
          <Button size="sm" variant="success" onClick={onInsertMemory}>Insert</Button>
        )}
        {existingMemoryTarget ? (
          <Button size="sm" variant="primary" onClick={onGoToMemory}>Go to Memory</Button>
        ) : (
          <Button size="sm" onClick={onAddMemory}>Add Memory</Button>
        )}
        <Button size="sm" variant='info' onClick={handleWiktionarySearch}>Search Wiktionary</Button>
        <Dropdown>
          <Dropdown.Toggle size="sm" variant="warning" disabled={occurrences.length === 0} id="dropdown-occurrences">
            🔍 <Badge bg="light" text="dark">{occurrences.length}</Badge>
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {occurrences.map((occ) => (
              <Dropdown.Item key={occ.segmentIndex} onClick={() => onNavigate && onNavigate(occ.segmentIndex)}>
                <span className="me-2 text-muted">#{occ.segmentIndex + 1}</span>
                <span>{occ.text.length > 30 ? occ.text.substring(0, 30) + '...' : occ.text}</span>
                {occ.isTranslated && <span className="ms-2" title="Translated">📝</span>}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
    </div>
  );
});

export default SelectionTooltip;