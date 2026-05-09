import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Form, ListGroup, Button, Badge, Stack, Dropdown, InputGroup, OverlayTrigger, Popover } from 'react-bootstrap';
import Mark from 'mark.js';
import { Source } from '../App';
import SpellCheckEditor from './SpellCheckEditor';
import { Diagnostic } from '@codemirror/lint';
import { useApp } from '../AppContext';
import { useSource } from '../SourceContext';
import WiktionaryModal from './WiktionaryModal';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import SplitSourceModal from './SplitSourceModal';
import pako from 'pako';
import UnderlinedText from './UnderlinedText';
import SelectionTooltip from './SelectionTooltip';
import ModeHelpAlert from './ModeHelpAlert';
import ScrollToButtons from './ScrollToButtons';

// Helper to decode from base64 Uint8Array
const atobUint8Array = (b64: string) => {
  const byteCharacters = atob(b64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
}

type SegmentType = 'Body' | 'Heading' | 'Skip';
type OutlineLevel = 'Skip' | 'Level 2' | 'Level 3' | 'Level 4' | 'Level 5';
type DelimiterAction = 'Skip Preceding' | 'Skip Succeeding' | 'Skip Both' | 'Keep Both';
type Placement = 'top' | 'bottom';

interface TranslationEditorProps {
  onSplit: (source: Source, splitIndex: number) => void;
  onTranslationsUpdate: () => void;
  onMemoryUpdate: () => void;
  memoryVersion: number;
  scrollToSegment: { sourceId: string; segmentIndex: number; } | null;
  onScrollToSegmentHandled: () => void;
  isDirty: boolean;
  setIsDirty: (isDirty: boolean) => void;
}

function isSelectionInSelector(selection: Selection, selector: string): boolean {
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  let startingElement: Element | null = commonAncestor.nodeType === Node.ELEMENT_NODE ? commonAncestor as Element : commonAncestor.parentElement;
  if (startingElement) {
    return startingElement.closest(selector) !== null;
  }
  return false;
}

const TranslationEditor: React.FC<TranslationEditorProps> = ({ onSplit, onTranslationsUpdate, onMemoryUpdate, memoryVersion, scrollToSegment, onScrollToSegmentHandled, isDirty, setIsDirty }) => {
  const { source, segments, delimiters } = useSource();
  const { spellCheck, handleSetItem, setError, scrollingReturnButtonsEnabled, scrollingReturnButtonsSensitivity } = useApp();

  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [currentNote, setCurrentNote] = useState('');
  const [currentBookmark, setCurrentBookmark] = useState<{ name: string; comment: string } | null>(null);
  const [initialBookmark, setInitialBookmark] = useState<{ name: string; comment: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [memories, setMemories] = useState<Record<string, string>>({});
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [numberedMemories, setNumberedMemories] = useState<Record<number, { source: string, target: string }>>({});
  const [showWiktionaryModal, setShowWiktionaryModal] = useState(false);
  const [wiktionaryTerm, setWiktionaryTerm] = useState('');
  const [visibleSegmentCount, setVisibleSegmentCount] = useState(50);
  const [goToSegment, setGoToSegment] = useState('');
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitIndex, setSplitIndex] = useState<number | null>(null);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [showBookmarkPopover, setShowBookmarkPopover] = useState(false);
  const [notePopoverPlacement, setNotePopoverPlacement] = useState<Placement>('top');
  const [bookmarkPopoverPlacement, setBookmarkPopoverPlacement] = useState<Placement>('top');


  const [segmentType, setSegmentType] = useState<SegmentType>('Body');
  const [outlineLevel, setOutlineLevel] = useState<OutlineLevel>('Level 2');
  const [delimiterAction, setDelimiterAction] = useState<DelimiterAction>('Skip Succeeding');
  
  const [initialEditorState, setInitialEditorState] = useState<any>(null);

  const [showGoToTop, setShowGoToTop] = useState(false);
  const [showGoToEditing, setShowGoToEditing] = useState(false);
  const editingSegmentRef = useRef<HTMLElement | null>(null);
  const [initialScrollTop, setInitialScrollTop] = useState<number | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const validSegments = useMemo(() => segments.map(s => s.trim()).filter(Boolean), [segments]);

  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({ threshold: 0.1 });

  const getDelimiterBadge = (delimiter?: string) => {
    if (!delimiter) return null;

    const getColor = () => {
        if (delimiter.includes('!')) return 'warning';
        if (delimiter.includes('?')) return 'info';
        return 'secondary';
    }

    const getTitle = () => {
        if (delimiter.includes('!')) return 'Delimiter (Exclamation)';
        if (delimiter.includes('?')) return 'Delimiter (Question)';
        return 'Delimiter';
    }

    return (
        <Badge 
            title={getTitle()} 
            bg={getColor()} 
            style={{marginLeft: '0.5em', padding: '0.75em', fontSize: '0.8em'}}
        >
            {delimiter}
        </Badge>
    );
  };

  useEffect(() => {
    const scrollContainer = document.querySelector('#page-content-wrapper');
    if (!scrollContainer) return;

    const handleScroll = () => {
      if (!scrollingReturnButtonsEnabled) {
        setShowGoToTop(false);
        setShowGoToEditing(false);
        return;
      }

      // Sensitivity: 1 (low) -> 10 (high).
      // For low sensitivity, user has to scroll more for buttons to appear.
      const topThreshold = 2500 - ((scrollingReturnButtonsSensitivity - 1) * 220); // Range: 2500px down to 520px
      setShowGoToTop(scrollContainer.scrollTop > topThreshold);

      if (editingSegment && initialScrollTop !== null) {
        // For low sensitivity (1), threshold is high (1500px), requiring a lot of scrolling.
        // For high sensitivity (10), threshold is low (204px), requiring little scrolling.
        const editingThreshold = 1500 - ((scrollingReturnButtonsSensitivity - 1) * 144); // Range: 1500px down to 204px
        const scrollDifference = Math.abs(scrollContainer.scrollTop - initialScrollTop);
        setShowGoToEditing(scrollDifference > editingThreshold);
      } else {
        setShowGoToEditing(false);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [scrollingReturnButtonsEnabled, scrollingReturnButtonsSensitivity, editingSegment, initialScrollTop]);

  useEffect(() => {
    if (editingSegment) {
      const currentIndex = validSegments.indexOf(editingSegment);
      if (currentIndex !== -1) {
        editingSegmentRef.current = document.getElementById(`segment-item-${currentIndex}`);
      }
    } else {
      editingSegmentRef.current = null;
    }
  }, [editingSegment, validSegments]);

  useEffect(() => {
    if (editingSegment && initialEditorState) {
      const currentState = {
        translation: currentTranslation,
        note: currentNote,
        bookmark: currentBookmark,

        segmentType: segmentType,
        outlineLevel: outlineLevel,
        delimiterAction: delimiterAction,
      };
      const hasChanged =
        currentState.translation !== initialEditorState.translation ||
        currentState.note !== initialEditorState.note ||
        JSON.stringify(currentState.bookmark) !== JSON.stringify(initialEditorState.bookmark) ||
        currentState.segmentType !== initialEditorState.segmentType ||
        currentState.outlineLevel !== initialEditorState.outlineLevel ||
        currentState.delimiterAction !== initialEditorState.delimiterAction;
      
      setIsDirty(hasChanged);
    } else {
      setIsDirty(false);
    }
  }, [currentTranslation, currentNote, currentBookmark, segmentType, outlineLevel, delimiterAction, editingSegment, initialEditorState, setIsDirty]);

  useEffect(() => {
    if (isIntersecting) {
      setVisibleSegmentCount(prevCount => prevCount + 50);
    }
  }, [isIntersecting]);

  useEffect(() => {
    if (scrollToSegment && source && scrollToSegment.sourceId === source.id) {
      setEditingSegment(null);
      const index = scrollToSegment.segmentIndex;
      if (index >= 0 && index < validSegments.length) {
        if (index >= visibleSegmentCount) {
          setVisibleSegmentCount(index + 50);
        }
        setTimeout(() => {
          const element = document.getElementById(`segment-item-${index}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-scroll');
            setTimeout(() => {
              element.classList.remove('highlight-scroll');
            }, 1500);
          }
          onScrollToSegmentHandled();
        }, 0);
      }
    }

    if (scrollToIndex !== null) {
      setEditingSegment(null);
      if (scrollToIndex >= 0 && scrollToIndex < validSegments.length) {
        if (scrollToIndex >= visibleSegmentCount) {
          setVisibleSegmentCount(scrollToIndex + 50);
        }
        setTimeout(() => {
          const element = document.getElementById(`segment-item-${scrollToIndex}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-scroll');
            setTimeout(() => {
              element.classList.remove('highlight-scroll');
            }, 1500);
          }
          setScrollToIndex(null);
        }, 0);
      }
    }
  }, [scrollToSegment, scrollToIndex, source, validSegments, visibleSegmentCount, onScrollToSegmentHandled]);

  const onMemoriesNumbered = useCallback((newMemories: Record<number, { source: string, target: string }>) => {
    setNumberedMemories(oldMemories => {
      if (JSON.stringify(oldMemories) === JSON.stringify(newMemories)) {
        return oldMemories;
      }
      return newMemories;
    });
  }, []);

  const handleInsertMemory = useCallback((text: string) => {
    setCurrentTranslation(prev => prev + text);
  }, []);

  useEffect(() => {
    if (source) {
      setEditingSegment(null);
      let mems = {};
      const rawMemories = localStorage.getItem(`memories_${source.id}`);
      if (rawMemories) {
        try {
          let decompressed = rawMemories;
          if (source.compression) {
            decompressed = pako.inflate(atobUint8Array(rawMemories), { to: 'string' });
          }
          mems = JSON.parse(decompressed);
        } catch (e: any) {
          setError({ title: 'Data Error', message: `Could not read memories: ${e.message}` });
        }
      }
      setMemories(mems);

      let trans = {};
      const rawTranslations = localStorage.getItem(`translations_${source.id}`);
      if (rawTranslations) {
        try {
          let decompressed = rawTranslations;
          if (source.compression) {
            decompressed = pako.inflate(atobUint8Array(rawTranslations), { to: 'string' });
          }
          trans = JSON.parse(decompressed);
        } catch (e: any) {
          setError({ title: 'Data Error', message: `Could not read translations: ${e.message}` });
        }
      }
      setTranslations(trans);
      setTranslatedTitle((trans as any)['__title__'] || '');

    } else {
      setTranslations({});
      setTranslatedTitle('');
      setVisibleSegmentCount(50);
    }
  }, [source, memoryVersion, setError]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setTooltip(null);
        if (isAddingMemory) {
          setIsAddingMemory(false);
          const instance = new Mark(editorRef.current as HTMLElement);
          instance.unmark();
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tooltipRef, isAddingMemory]);

  const handleEdit = (segment: string) => {
    const scrollContainer = document.querySelector('#page-content-wrapper');
    if (scrollContainer) {
        setInitialScrollTop(scrollContainer.scrollTop);
    }

    const trimmedSegment = segment.trim();
    setEditingSegment(trimmedSegment);
    const translationData = translations[trimmedSegment];
    
    let initialState = {};
    if (typeof translationData === 'object' && translationData !== null) {
      const translation = translationData.text || '';
      const note = translationData.note || '';
      const bookmark = translationData.bookmark || null;
      const segType = translationData.segmentType || 'Body';
      const outLevel = translationData.outlineLevel || 'Level 2';
      const delAction = translationData.delimiterAction || 'Skip Succeeding';

      setCurrentTranslation(translation);
      setCurrentNote(note);
      setCurrentBookmark(bookmark);
      setInitialBookmark(bookmark);
      setSegmentType(segType);
      setOutlineLevel(outLevel);
      setDelimiterAction(delAction);

      initialState = { translation, note, bookmark, segmentType: segType, outlineLevel: outLevel, delimiterAction: delAction };
    } else {
      const translation = translationData || '';
      setCurrentTranslation(translation);
      setCurrentNote('');
      setCurrentBookmark(null);
      setInitialBookmark(null);
      setSegmentType('Body');
      setOutlineLevel('Level 2');
      setDelimiterAction('Skip Succeeding');
      initialState = { translation, note: '', bookmark: null, segmentType: 'Body', outlineLevel: 'Level 2', delimiterAction: 'Skip Succeeding' };
    }
    setInitialEditorState(initialState);
    setDiagnostics([]);
    setNumberedMemories({});
  };

  const saveData = (key: string, data: any) => {
    if (!source) return false;
    const stringified = JSON.stringify(data);
    let valueToStore = stringified;
    if (source.compression) {
      try {
        valueToStore = btoa(String.fromCharCode(...pako.deflate(stringified, { level: source.compressionLevel })));
      } catch (err: any) {
        setError({ title: 'Compression Error', message: `Failed to save data for key ${key}: ${err.message}` });
        return false;
      }
    }
    return handleSetItem(key, valueToStore);
  }

  const handleSave = (segment: string) => {
    if (hasErrors && segmentType !== 'Skip') return;
    const trimmedSegment = segment.trim();
    const updatedTranslations = { 
      ...translations, 
      [trimmedSegment]: { 
        text: currentTranslation, 
        note: currentNote, 
        bookmark: currentBookmark,

        segmentType: segmentType,
        outlineLevel: outlineLevel,
        delimiterAction: segmentType === 'Skip' ? delimiterAction : undefined
      } 
    };
    
    if (source) {
      if (saveData(`translations_${source.id}`, updatedTranslations)) {
        setTranslations(updatedTranslations);
        onTranslationsUpdate();
        setEditingSegment(null);
        setInitialScrollTop(null);
        setIsDirty(false);
      }
    }
  };

  const handleSaveAndEditNext = (currentSegmentTrimmed: string) => {
    if (hasErrors && segmentType !== 'Skip') return;

    const updatedTranslations = { 
      ...translations, 
      [currentSegmentTrimmed]: { 
        text: currentTranslation, 
        note: currentNote, 
        bookmark: currentBookmark,

        segmentType: segmentType,
        outlineLevel: outlineLevel,
        delimiterAction: segmentType === 'Skip' ? delimiterAction : undefined
      } 
    };
    
    if (source) {
      if (saveData(`translations_${source.id}`, updatedTranslations)) {
        setTranslations(updatedTranslations);
        onTranslationsUpdate();
        setIsDirty(false);
        const currentIndex = validSegments.indexOf(currentSegmentTrimmed);
        if (currentIndex < validSegments.length - 1) {
          const nextSegmentToEdit = validSegments[currentIndex + 1];
          handleEdit(nextSegmentToEdit);
        } else {
          setEditingSegment(null);
          setInitialScrollTop(null);
        }
      }
    }
  };

  const handleCancel = () => {
    setEditingSegment(null);
    setInitialScrollTop(null);
    setIsDirty(false);
  };

  const handleTitleSave = () => {
    const updatedTranslations = { ...translations, '__title__': translatedTitle };
    if (source) {
      if (saveData(`translations_${source.id}`, updatedTranslations)) {
        setTranslations(updatedTranslations);
        onTranslationsUpdate();
      }
    }
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (tooltipRef.current && tooltipRef.current.contains(event.target as Node)) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString() 
      && (isSelectionInSelector(selection, '.source-text') || isSelectionInSelector(selection, '#current-editing-translation-source-text'))) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setTooltip({ x: rect.left, y: rect.top - 30, text: selection.toString() });
    } else {
      setTooltip(null);
    }
  };

  const handleAddMemory = () => {
    if (tooltip) {
      const instance = new Mark(editorRef.current as HTMLElement);
      instance.unmark({ done: () => instance.mark(tooltip.text, { separateWordSearch: false, accuracy: 'exactly'}) });
      setIsAddingMemory(true);
    }
  };

  const handleSaveMemory = (target: string) => {
    if (tooltip && source) {
      const updatedMemories = { ...memories, [tooltip.text]: target };
      if (saveData(`memories_${source.id}`, updatedMemories)) {
        onMemoryUpdate();
        setIsAddingMemory(false);
        setTooltip(null);
        const instance = new Mark(editorRef.current as HTMLElement);
        instance.unmark();
      }
    }
  };

  const handleWiktionarySearch = (term: string) => {
    setWiktionaryTerm(term);
    setShowWiktionaryModal(true);
  };

  const navigateToSegment = (index: number) => {
    if (index >= 0 && index < validSegments.length) {
      if (index >= visibleSegmentCount) {
        setVisibleSegmentCount(index + 50);
      }
      setScrollToIndex(index);
    }
  };

  const handleGoToIncomplete = () => {
    const nextIncompleteIndex = validSegments.findIndex(seg => {
      const translationData = translations[seg];
      const text = (typeof translationData === 'object' && translationData !== null) ? translationData.text : translationData;
      return !text && translationData?.segmentType !== 'Skip';
    });
    if (nextIncompleteIndex !== -1) {
      navigateToSegment(nextIncompleteIndex);
    } else {
      alert('All segments are complete!');
    }
  };

  const handleGoToEnd = () => {
    navigateToSegment(validSegments.length - 1);
  };

  const handleGoToSegment = () => {
    const targetIndex = parseInt(goToSegment, 10) - 1;
    navigateToSegment(targetIndex);
  };

  const handleShowSplitModal = (index: number) => {
    setSplitIndex(index);
    setShowSplitModal(true);
  };

  const handleExecuteSplit = () => {
    if (source && splitIndex !== null) {
      onSplit(source, splitIndex);
      setShowSplitModal(false);
      setSplitIndex(null);
    }
  };

  const handleSegmentTypeChange = (newType: SegmentType) => {
    if (segmentType === 'Skip' && newType !== 'Skip') {
      setDelimiterAction('Keep Both');
    }
    setSegmentType(newType);
  };

  const handleBookmarkClick = (index: number) => {
    if (!currentBookmark) {
      const newBookmark = { name: `Segment ${index + 1}`, comment: '' };
      setCurrentBookmark(newBookmark);
      setInitialBookmark(null); // Make sure it's different from initial
    }
    setShowBookmarkPopover(!showBookmarkPopover);
  };

  const handleSaveBookmark = () => {
    if (editingSegment) {
      const updatedTranslations = { 
        ...translations, 
        [editingSegment]: { 
          ...translations[editingSegment],
          text: currentTranslation, 
          note: currentNote, 
          bookmark: currentBookmark,
          segmentType: segmentType,
          outlineLevel: outlineLevel,
          delimiterAction: segmentType === 'Skip' ? delimiterAction : undefined
        } 
      };
      if (source) {
        if (saveData(`translations_${source.id}`, updatedTranslations)) {
          setTranslations(updatedTranslations);
          onTranslationsUpdate();
          setInitialBookmark(currentBookmark);
          setShowBookmarkPopover(false);
        }
      }
    }
  };

  const handleDeleteBookmark = () => {
    if (editingSegment) {
      setCurrentBookmark(null);
      const updatedTranslations = { 
        ...translations, 
        [editingSegment]: { 
          ...translations[editingSegment],
          text: currentTranslation, 
          note: currentNote, 
          bookmark: null,
          segmentType: segmentType,
          outlineLevel: outlineLevel,
          delimiterAction: segmentType === 'Skip' ? delimiterAction : undefined
        } 
      };
      if (source) {
        if (saveData(`translations_${source.id}`, updatedTranslations)) {
          setTranslations(updatedTranslations);
          onTranslationsUpdate();
          setInitialBookmark(null);
          setShowBookmarkPopover(false);
        }
      }
    }
  };

  const handleGoToTop = () => {
    const scrollContainer = document.querySelector('#page-content-wrapper');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGoToEditing = () => {
    if (editingSegmentRef.current) {
      editingSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const bookmarks = useMemo(() => {
    return validSegments.map((seg, index) => {
      const data = translations[seg];
      if (data?.bookmark?.name) {
        return { name: data.bookmark.name, index };
      }
      return null;
    }).filter(Boolean) as { name: string; index: number; }[];
  }, [translations, validSegments]);

  if (!source) {
    return <div>
      <ModeHelpAlert mode="translation" className='mt-4' />
      Please select a source from the sidebar to start translating.
    </div>;
  }

  const spellingErrors = diagnostics.filter(d => d.severity === 'warning');
  const hasErrors = spellCheck && spellingErrors.length > 0;

  const isBookmarkUnchanged = initialBookmark !== null && JSON.stringify(currentBookmark) === JSON.stringify(initialBookmark);

  const getSettingsPopover = (index: number) => (
    <Popover id="popover-basic">
      <Popover.Body>
        
        <div title={index === 0 ? 'Cannot split on first segment.' : ''}>
          <Button variant="info" size="sm" className="w-100 mb-3" onClick={() => handleShowSplitModal(index)} disabled={index === 0}>
            ✂️ Split Source Before This Segment
          </Button>
        </div>

        <Form.Group className="mb-3">
            <Form.Label>Segment Type</Form.Label>
            <Form.Select value={segmentType} onChange={(e) => handleSegmentTypeChange(e.target.value as SegmentType)} size="sm">
                <option value="Body">Body</option>
                <option value="Heading">Heading</option>
                <option value="Skip">Skip</option>
            </Form.Select>
        </Form.Group>
        {segmentType === 'Heading' && (
            <Form.Group className="mb-3">
                <Form.Label>Outline Level</Form.Label>
                <Form.Select value={outlineLevel} onChange={(e) => setOutlineLevel(e.target.value as OutlineLevel)} size="sm">
                    <option value="Skip">Skip</option>
                    <option value="Level 2">Level 2</option>
                    <option value="Level 3">Level 3</option>
                    <option value="Level 4">Level 4</option>
                    <option value="Level 5">Level 5</option>
                </Form.Select>
            </Form.Group>
        )}
        {segmentType === 'Skip' && (
            <Form.Group className="mb-3">
                <Form.Label>Delimiter Actions</Form.Label>
                <Form.Select value={delimiterAction} onChange={(e) => setDelimiterAction(e.target.value as DelimiterAction)} size="sm">
                    <option value="Keep Both">Keep Both</option>
                    <option value="Skip Preceding">Skip Preceding</option>
                    <option value="Skip Succeeding">Skip Succeeding</option>
                    <option value="Skip Both">Skip Both</option>
                </Form.Select>
            </Form.Group>
        )}
      </Popover.Body>
    </Popover>
  );

  const notePopover = (
    <Popover id="popover-basic" className="resizable-popover">
      <Popover.Header as="h3" className="d-flex justify-content-between align-items-center">
        Segment Note
        <Button variant="link" size="sm" onClick={() => setNotePopoverPlacement(p => p === 'top' ? 'bottom' : 'top')}>🔃</Button>
      </Popover.Header>
      <Popover.Body>
        <Form.Control
          as="textarea"
          rows={3}
          value={currentNote}
          onChange={(e) => setCurrentNote(e.target.value)}
          autoFocus
          className="resizable-textarea"
        />
      </Popover.Body>
    </Popover>
  );

  const bookmarkPopover = (
    <Popover id="popover-bookmark" className="resizable-popover">
      <Popover.Header as="h3" className="d-flex justify-content-between align-items-center">
        Bookmark
        <Button variant="link" size="sm" onClick={() => setBookmarkPopoverPlacement(p => p === 'top' ? 'bottom' : 'top')}>🔃</Button>
      </Popover.Header>
      <Popover.Body>
        <Form.Group className="mb-2">
          <Form.Label>Name</Form.Label>
          <Form.Control 
            type="text" 
            value={currentBookmark?.name || ''} 
            onChange={(e) => setCurrentBookmark(prev => ({ ...prev, name: e.target.value, comment: prev?.comment || '' }))} 
            autoFocus
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Comment</Form.Label>
          <Form.Control 
            as="textarea" 
            rows={3} 
            value={currentBookmark?.comment || ''}
            onChange={(e) => setCurrentBookmark(prev => ({ ...prev, name: prev?.name || '', comment: e.target.value }))} 
            className="resizable-textarea"
          />
        </Form.Group>
        <Stack direction="horizontal" gap={2}>
          <Button variant="primary" size="sm" onClick={handleSaveBookmark} disabled={isBookmarkUnchanged}>Save</Button>
          <Button variant="danger" size="sm" onClick={handleDeleteBookmark}>Delete</Button>
        </Stack>
      </Popover.Body>
    </Popover>
  );

  const renderSegmentContent = (segment: string, translationData: any, delimiter?: string) => {
    const translationText = translationData?.text;
    const segType = translationData?.segmentType || 'Body';
    const outLevel = translationData?.outlineLevel || (
      segType === 'Heading' ? 'Level 2' : 'Skip'
    );
    const textToShow = segType === 'Skip' ? segment : (translationText || segment);

    if (segType === 'Heading') {
      if (outLevel === 'Level 2') return <h2>{textToShow}</h2>;
      if (outLevel === 'Level 3') return <h3>{textToShow}</h3>;
      if (outLevel === 'Level 4') return <h4>{textToShow}</h4>;
      if (outLevel === 'Level 5') return <h5>{textToShow}</h5>;
    }
    const delimiterBadge = getDelimiterBadge(delimiter);
    return <p className={`mb-0 ${!translationText && segType !== 'Skip' ? 'source-text' : ''} ${segType === 'Skip' ? 'text-muted' : ''}`}>{textToShow}{delimiter && delimiterBadge}</p>;
  };

  return (
    <div ref={editorRef} onMouseUp={handleMouseUp}>
      {tooltip && (
        <SelectionTooltip 
          ref={tooltipRef}
          x={tooltip.x} 
          y={tooltip.y} 
          text={tooltip.text}
          onAddMemory={handleAddMemory} 
          onSaveMemory={handleSaveMemory}
          onWiktionarySearch={handleWiktionarySearch}
          isAddingMemory={isAddingMemory}
        />
      )}
      <WiktionaryModal show={showWiktionaryModal} onHide={() => setShowWiktionaryModal(false)} term={wiktionaryTerm} />
      {source && splitIndex !== null && (
        <SplitSourceModal 
          show={showSplitModal}
          onHide={() => setShowSplitModal(false)}
          onExecute={handleExecuteSplit}
          source={source}
          splitIndex={splitIndex}
          segments={segments}
          delimiters={delimiters}
        />
      )}
      <div id="translation-editor-title-bar" className="d-flex justify-content-between align-items-center">
        <h1>{translatedTitle || source.title}</h1>
        <Stack direction="horizontal" gap={2}>
          <InputGroup size="sm">
            <Dropdown>
              <Dropdown.Toggle variant="outline-danger" id="dropdown-basic">
                Bookmarks
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {bookmarks.length > 0 ? (
                  bookmarks.map(b => (
                    <Dropdown.Item key={b.index} onClick={() => navigateToSegment(b.index)}>{b.name}</Dropdown.Item>
                  ))
                ) : (
                  <Dropdown.Item disabled>No bookmarks found</Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown>
            <Button title='Go to the first incomplete translation segment' variant="outline-info" onClick={handleGoToIncomplete}>Incomplete</Button>
            <Button title='Go to the last segment' variant="outline-dark" onClick={handleGoToEnd}>⬇</Button>
            <Form.Control
              id='go-to-segment-number-input'
              type="number"
              value={goToSegment}
              onChange={(e) => setGoToSegment(e.target.value)}
              style={{ maxWidth: '80px' }}
            />
            <InputGroup.Text id='go-to-segment-number-length'>/ {validSegments.length}</InputGroup.Text>
            <Button variant="outline-dark" onClick={handleGoToSegment}>Go</Button>
          </InputGroup>
        </Stack>
      </div>
      <Form.Group controlId="translatedTitle" className="mt-2">
        <Form.Label>Translated Title</Form.Label>
        <Form.Control 
          type="text" 
          placeholder="Enter translated title"
          value={translatedTitle} 
          onChange={(e) => setTranslatedTitle(e.target.value)} 
          onBlur={handleTitleSave}
        />
      </Form.Group>
      
      <div className='mt-4'>
        <ModeHelpAlert mode="translation" />
        <ListGroup>
          {validSegments.slice(0, visibleSegmentCount).map((segment, index) => {
            const isLastSegment = index === validSegments.length - 1;
            const translationData = translations[segment];
            const noteText = translationData?.note;
            const bookmarkData = translationData?.bookmark;
            const segType = translationData?.segmentType || 'Body';
            const delimiter = delimiters[index]?.replaceAll('\n', '⏎')
            
            return (
              <ListGroup.Item key={index} id={`segment-item-${index}`} className={`d-flex align-items-center ${segType === 'Skip' ? 'list-group-item-light' : ''}`}>
                  {editingSegment === segment ? (
                    <div className="w-100">
                      <UnderlinedText text={segment} memories={memories} onInsert={handleInsertMemory} onMemoriesNumbered={onMemoriesNumbered} memoryVersion={memoryVersion} />
                      {getDelimiterBadge(delimiter)}
                      <SpellCheckEditor 
                        value={currentTranslation} 
                        onChange={setCurrentTranslation} 
                        onDiagnosticsChange={setDiagnostics}
                        autofocus={editingSegment === segment}
                        numberedMemories={numberedMemories}
                        isDirty={isDirty}
                        />
                      <Stack direction='horizontal' gap={1}>
                        <Button variant="success" size="sm" className="mt-2" onClick={() => handleSaveAndEditNext(segment)} disabled={isLastSegment || (hasErrors && segmentType !== 'Skip') || (!currentTranslation && segmentType !== 'Skip')}>Save & Edit Next</Button>
                        <Button variant="primary" size="sm" className="mt-2 ml-2" onClick={() => handleSave(segment)} disabled={(hasErrors && segmentType !== 'Skip') || (!currentTranslation && segmentType !== 'Skip')}>Save</Button>
                        <OverlayTrigger trigger="click" placement={notePopoverPlacement} overlay={notePopover} rootClose>
                          <Button variant={currentNote ? "warning" : "outline-warning"} size="sm" className="mt-2 ml-2">Note</Button>
                        </OverlayTrigger>
                        <OverlayTrigger show={showBookmarkPopover} trigger="click" placement={bookmarkPopoverPlacement} overlay={bookmarkPopover} rootClose onToggle={() => setShowBookmarkPopover(!showBookmarkPopover)}>
                          <Button variant={currentBookmark ? "danger" : "outline-danger"} size="sm" className="mt-2 ml-2" onClick={() => handleBookmarkClick(index)}>Bookmark</Button>
                        </OverlayTrigger>
                        <Button variant="secondary" size="sm" className="mt-2 ml-2" onClick={handleCancel}>Cancel</Button>
                        <Form.Label column className='mt-2'>{' '}<small>Segment #{index+1}</small></Form.Label>
                        <OverlayTrigger trigger="click" placement="left" overlay={getSettingsPopover(index)} rootClose>
                          <Button variant="secondary" size="sm" className="mt-2">⚙️</Button>
                        </OverlayTrigger>
                      </Stack>
                    </div>
                  ) : (
                    <div className="d-flex justify-content-between align-items-center w-100">
                      {renderSegmentContent(segment, translationData, delimiter)}
                      <Stack direction='horizontal'>
                        {noteText && <span title={`Note: ${noteText}`} style={{ paddingRight: '1em' }}>🗒️</span>}
                        {bookmarkData && <span title={`${bookmarkData.name}${bookmarkData.comment ? `:\n${bookmarkData.comment}` : ''}`} style={{ paddingRight: '1em' }}>🔖</span>}
                        <Button variant="link" title='Edit segment' onClick={() => handleEdit(segment)} style={{textDecoration: 'none'}}>✏️</Button>
                      </Stack>
                    </div>
                  )}
                </ListGroup.Item>
              )
            })}
        </ListGroup>
      </div>
      <div ref={sentinelRef} />
      <ScrollToButtons
        showGoToTop={showGoToTop}
        onGoToTop={handleGoToTop}
        showGoToEditing={showGoToEditing}
        onGoToEditing={handleGoToEditing}
      />
    </div>
  );
}

export default TranslationEditor;