import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Form, ListGroup, Button, Badge, Stack, Dropdown, InputGroup, OverlayTrigger, Popover, CloseButton } from 'react-bootstrap';
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
import SelectionTooltip, { Occurrence } from './SelectionTooltip';
import ModeHelpAlert from './ModeHelpAlert';
import ScrollToButtons from './ScrollToButtons';
import FindReplaceModal from './FindReplaceModal';
import { Abjhad } from '../vendor/scripts/Abjhad';

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
  onSourceUpdate: (updatedSource: Source) => void;
  onNavigateToMemoryTab: (memoryKey: string) => void;
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

const TranslationEditor: React.FC<TranslationEditorProps> = ({ onSplit, onTranslationsUpdate, onMemoryUpdate, memoryVersion, scrollToSegment, onScrollToSegmentHandled, isDirty, setIsDirty, onSourceUpdate, onNavigateToMemoryTab }) => {
  const { source, segments, delimiters } = useSource();
  const { spellCheck, handleSetItem, setError, scrollingReturnButtonsEnabled, scrollingReturnButtonsSensitivity, fuzzySearchThreshold, transliterationEnabled, transliterationScript, transliterationFont, transliterationFontSizeMultiplier } = useApp();

  const [showFindReplaceModal, setShowFindReplaceModal] = useState(false);

  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; isEditorView?: boolean } | null>(null);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [showBookmarkPopover, setShowBookmarkPopover] = useState(false);
  const [notePopoverPlacement, setNotePopoverPlacement] = useState<Placement>('top');
  const [bookmarkPopoverPlacement, setBookmarkPopoverPlacement] = useState<Placement>('top');
  const [autoSelectText, setAutoSelectText] = useState<{ segmentIndex: number; text: string } | null>(null);

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
  const previousSourceIdRef = useRef<string | null>(null);

  const { validSegments, validToOriginalIndexMap, leftDelimiters, rightDelimiters } = useMemo(() => {
    const valid: string[] = [];
    const map: number[] = [];
    segments.forEach((seg, originalIndex) => {
      if (seg.trim()) {
        valid.push(seg.trim());
        map.push(originalIndex);
      }
    });

    const leftDelims = new Array(valid.length).fill(null).map(() => [] as string[]);
    const rightDelims = new Array(valid.length).fill(null).map(() => [] as string[]);

    delimiters.forEach((delim, i) => {
      if (!delim) return;
      const isLeft = /^\s*[{\[(<“‘«¿¡『【「《]/.test(delim);
      if (isLeft) {
        const validIdx = valid.findIndex((_, vIdx) => map[vIdx] >= i + 1);
        if (validIdx !== -1) {
          leftDelims[validIdx].push(delim);
        } else if (valid.length > 0) {
          rightDelims[valid.length - 1].push(delim);
        }
      } else {
        let validIdx = -1;
        for (let vIdx = valid.length - 1; vIdx >= 0; vIdx--) {
          if (map[vIdx] <= i) {
            validIdx = vIdx;
            break;
          }
        }
        if (validIdx !== -1) {
          rightDelims[validIdx].push(delim);
        } else if (valid.length > 0) {
          leftDelims[0].push(delim);
        }
      }
    });

    return { 
      validSegments: valid, 
      validToOriginalIndexMap: map, 
      leftDelimiters: leftDelims, 
      rightDelimiters: rightDelims 
    };
  }, [segments, delimiters]);

  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({ threshold: 0.1 });

  const getDelimiterBadges = (delims: string[], side: 'left' | 'right') => {
    if (!delims || delims.length === 0) return null;

    return delims.map((delimiter, i) => {
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

        const marginStyle = side === 'left' ? { marginRight: '0.5em' } : { marginLeft: '0.5em' };

        return (
            <Badge 
                key={i}
                title={getTitle()} 
                bg={getColor()} 
                style={{ ...marginStyle, padding: '0.75em', fontSize: '0.8em' }}
            >
                {delimiter}
            </Badge>
        );
    });
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
    if (autoSelectText && editingSegment && validSegments.indexOf(editingSegment) === autoSelectText.segmentIndex) {
      const timer = setTimeout(() => {
        const sourceTextElement = document.getElementById('current-editing-translation-source-text');
        if (sourceTextElement) {
          const findTextNode = (node: Node, text: string): { node: Node, offset: number } | null => {
            if (node.nodeType === Node.TEXT_NODE) {
              const idx = node.textContent?.indexOf(text);
              if (idx !== undefined && idx !== -1) {
                return { node, offset: idx };
              }
            } else {
              for (const child of Array.from(node.childNodes)) {
                const res = findTextNode(child, text);
                if (res) return res;
              }
            }
            return null;
          };
          
          const match = findTextNode(sourceTextElement, autoSelectText.text);
          if (match) {
            const range = document.createRange();
            range.setStart(match.node, match.offset);
            range.setEnd(match.node, match.offset + autoSelectText.text.length);
            const selection = window.getSelection();
            if (selection) {
              // Blur the active element (e.g., CodeMirror) so it doesn't immediately steal the selection back
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              selection.removeAllRanges();
              selection.addRange(range);
              // Calculate position relative to editorRef
              const rect = range.getBoundingClientRect();
              const editorRect = editorRef.current?.getBoundingClientRect();
              if (editorRect) {
                setTooltip({ 
                  x: rect.left - editorRect.left, 
                  y: rect.top - editorRect.top - 45, 
                  text: autoSelectText.text 
                });
              }
            }
          }
        }
        setAutoSelectText(null);
      }, 400); // Wait 400ms for Mark.js to finish replacing DOM nodes
      return () => clearTimeout(timer);
    }
  }, [autoSelectText, editingSegment, validSegments]);

  useEffect(() => {
    if (scrollToSegment && source && scrollToSegment.sourceId === source.id) {
      setEditingSegment(null);
      setEditingSegmentIndex(null);
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
      setEditingSegmentIndex(null);
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
      if (previousSourceIdRef.current !== source.id) {
        setEditingSegment(null);
        setEditingSegmentIndex(null);
        previousSourceIdRef.current = source.id;
      }
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

  const confirmAndProceed = (callback: () => void) => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Are you sure you want to discard them?')) {
        setIsDirty(false);
        callback();
      }
    } else {
      callback();
    }
  };

  const handleEdit = (segment: string, index?: number) => {
    const scrollContainer = document.querySelector('#page-content-wrapper');
    if (scrollContainer) {
        setInitialScrollTop(scrollContainer.scrollTop);
    }

    const trimmedSegment = segment.trim();
    setEditingSegment(trimmedSegment);
    if (index !== undefined) {
      setEditingSegmentIndex(index);
    } else {
      setEditingSegmentIndex(validSegments.indexOf(trimmedSegment));
    }
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
        setEditingSegmentIndex(null);
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
        const currentIndex = editingSegmentIndex !== null ? editingSegmentIndex : validSegments.indexOf(currentSegmentTrimmed);
        if (currentIndex < validSegments.length - 1) {
          const nextSegmentToEdit = validSegments[currentIndex + 1];
          handleEdit(nextSegmentToEdit, currentIndex + 1);
        } else {
          setEditingSegment(null);
          setEditingSegmentIndex(null);
          setInitialScrollTop(null);
        }
      }
    }
  };

  const handleClearAndSave = (segment: string) => {
    if (window.confirm("Are you sure you want to clear the target text?")) {
      const trimmedSegment = segment.trim();
      const updatedTranslations = { 
        ...translations, 
        [trimmedSegment]: { 
          text: '', 
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
          setEditingSegmentIndex(null);
          setInitialScrollTop(null);
          setIsDirty(false);
        }
      }
    }
  };

  const handleCancel = () => {
    setEditingSegment(null);
    setEditingSegmentIndex(null);
    setInitialScrollTop(null);
    setIsDirty(false);
  };

  const handleDisconnect = (segment: string, validIndex: number) => {
    if (!source) return;
    
    const originalIndex = validToOriginalIndexMap[validIndex];
    let newContent = '';
    for (let i = 0; i < segments.length; i++) {
      if (i === originalIndex) {
        newContent += segments[i] + '\u200B';
      } else {
        newContent += segments[i];
      }
      if (i < delimiters.length) {
        newContent += delimiters[i];
      }
    }

    let finalContent = newContent;
    if (source.compression) {
      try {
        finalContent = btoa(String.fromCharCode(...pako.deflate(newContent, { level: source.compressionLevel })));
      } catch (err: any) {
        setError({ title: 'Compression Error', message: `Failed to compress source content during disconnect: ${err.message}` });
        return;
      }
    }

    const updatedSource = {
      ...source,
      content: finalContent
    };
    onSourceUpdate(updatedSource);

    const newSegment = segment + '\u200B';
    const updatedTranslations = { ...translations };
    updatedTranslations[newSegment.trim()] = { ...translations[segment.trim()] };
    
    if (saveData(`translations_${source.id}`, updatedTranslations)) {
      setTranslations(updatedTranslations);
      onTranslationsUpdate();
    }

    handleEdit(newSegment, validIndex);
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

  const handleConfirmReplace = (replacements: { segment: string, newTarget: string }[]) => {
    if (!source) return;
    const updatedTranslations = { ...translations };
    replacements.forEach(({ segment, newTarget }) => {
        const existingData = updatedTranslations[segment];
        if (typeof existingData === 'object' && existingData !== null) {
            updatedTranslations[segment] = { ...existingData, text: newTarget };
        } else {
            updatedTranslations[segment] = newTarget;
        }
    });

    if (saveData(`translations_${source.id}`, updatedTranslations)) {
        setTranslations(updatedTranslations);
        onTranslationsUpdate();
        
        // If we are currently editing one of the replaced segments, update the current Translation text in the editor
        if (editingSegment && replacements.some(r => r.segment === editingSegment)) {
            const match = replacements.find(r => r.segment === editingSegment);
            if (match) setCurrentTranslation(match.newTarget);
        }
    }
  };

  const handleMemoryClick = useCallback((sourceText: string, rect: DOMRect) => {
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (editorRect) {
      setTooltip({
        x: rect.left - editorRect.left,
        y: rect.top - editorRect.top - 45,
        text: sourceText,
        isEditorView: true
      });
    }
  }, []);

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (tooltipRef.current && tooltipRef.current.contains(event.target as Node)) {
      return;
    }
    if ((event.target as HTMLElement).classList?.contains('memory-highlight')) {
        return; 
    }
    const selection = window.getSelection();
    if (selection && selection.toString() 
      && (isSelectionInSelector(selection, '.source-text') || isSelectionInSelector(selection, '#current-editing-translation-source-text'))) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current?.getBoundingClientRect();
      const isEditorView = isSelectionInSelector(selection, '#current-editing-translation-source-text');
      if (editorRect) {
        setTooltip({ 
          x: rect.left - editorRect.left, 
          y: rect.top - editorRect.top - 45, 
          text: selection.toString(),
          isEditorView
        });
      }
    } else {
      setTooltip(null);
    }
  };

  const occurrences = useMemo(() => {
    if (!tooltip || !tooltip.text) return [];
    const lowerText = tooltip.text.toLowerCase();
    const result: Occurrence[] = [];
    validSegments.forEach((segment, index) => {
      // Find segments that contain the selected text
      // We'll exclude the current editing segment since that's where they likely are right now,
      // or we can just include it but it's redundant. We'll include it unless it's the exact editing segment.
      if (editingSegment === segment) return;
      
      if (segment.toLowerCase().includes(lowerText)) {
        const translationData = translations[segment];
        const isTranslated = typeof translationData === 'object' && translationData !== null 
          ? !!translationData.text && translationData.segmentType !== 'Skip'
          : !!translationData;
        result.push({ segmentIndex: index, text: segment, isTranslated });
      }
    });
    return result;
  }, [tooltip, validSegments, translations, editingSegment]);

  const handleNavigateWithSelection = (index: number, textToSelect: string) => {
    confirmAndProceed(() => {
      // Hide the tooltip during scroll/navigation so it doesn't jump around
      setTooltip(null);

      if (index >= visibleSegmentCount) {
        setVisibleSegmentCount(index + 50);
      }
      
      setAutoSelectText({ segmentIndex: index, text: textToSelect });

      setTimeout(() => {
        const element = document.getElementById(`segment-item-${index}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-scroll');
          setTimeout(() => {
            element.classList.remove('highlight-scroll');
          }, 1500);
        }
        handleEdit(validSegments[index], index);
      }, 0);
    });
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

  const renderSegmentContent = (segment: string, translationData: any, leftDelims: string[], rightDelims: string[]) => {
    const translationText = translationData?.text;
    const segType = translationData?.segmentType || 'Body';
    const outLevel = translationData?.outlineLevel || (
      segType === 'Heading' ? 'Level 2' : 'Skip'
    );
    let textToShow = segType === 'Skip' ? segment : (translationText || segment);
    
    let fontStyle: React.CSSProperties = {};
    if (transliterationEnabled && transliterationScript === Abjhad.name) {
      if (translationText) {
        textToShow = Abjhad.transliterate(textToShow);
        fontStyle = {
          fontFamily: transliterationFont,
          fontSize: `${transliterationFontSizeMultiplier}em`
        };
      }
    }

    if (segType === 'Heading') {
      if (outLevel === 'Level 2') return <h2>{getDelimiterBadges(leftDelims, 'left')}<span style={fontStyle}>{textToShow}</span>{getDelimiterBadges(rightDelims, 'right')}</h2>;
      if (outLevel === 'Level 3') return <h3>{getDelimiterBadges(leftDelims, 'left')}<span style={fontStyle}>{textToShow}</span>{getDelimiterBadges(rightDelims, 'right')}</h3>;
      if (outLevel === 'Level 4') return <h4>{getDelimiterBadges(leftDelims, 'left')}<span style={fontStyle}>{textToShow}</span>{getDelimiterBadges(rightDelims, 'right')}</h4>;
      if (outLevel === 'Level 5') return <h5>{getDelimiterBadges(leftDelims, 'left')}<span style={fontStyle}>{textToShow}</span>{getDelimiterBadges(rightDelims, 'right')}</h5>;
    }
    
    return <p className={`mb-0 ${!translationText && segType !== 'Skip' ? 'source-text' : ''} ${segType === 'Skip' ? 'text-muted' : ''}`}>
      {getDelimiterBadges(leftDelims, 'left')}
      <span style={fontStyle}>{textToShow}</span>
      {getDelimiterBadges(rightDelims, 'right')}
    </p>;
  };

  const existingMemoryTarget = tooltip && tooltip.text && memories[tooltip.text] ? memories[tooltip.text] : undefined;

  const handleInsertMemoryFromTooltip = () => {
    if (existingMemoryTarget) {
      const targetText = existingMemoryTarget.startsWith('@') ? memories[existingMemoryTarget.substring(1)] : existingMemoryTarget;
      if (targetText) {
        handleInsertMemory(targetText);
        setTooltip(null);
      }
    }
  };

  const handleGoToMemory = () => {
    if (tooltip && tooltip.text) {
      let keyToScroll = tooltip.text;
      if (existingMemoryTarget?.startsWith('@')) {
         keyToScroll = existingMemoryTarget.substring(1);
      }
      onNavigateToMemoryTab(keyToScroll);
      setTooltip(null);
    }
  };

  return (
    <div ref={editorRef} onMouseUp={handleMouseUp} style={{ position: 'relative' }}>
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
          occurrences={occurrences}
          onNavigate={(index) => handleNavigateWithSelection(index, tooltip.text)}
          existingMemoryTarget={existingMemoryTarget}
          onGoToMemory={handleGoToMemory}
          onInsertMemory={tooltip.isEditorView && existingMemoryTarget ? handleInsertMemoryFromTooltip : undefined}
        />
      )}
      <WiktionaryModal show={showWiktionaryModal} onHide={() => setShowWiktionaryModal(false)} term={wiktionaryTerm} />
      <FindReplaceModal 
        show={showFindReplaceModal} 
        onHide={() => setShowFindReplaceModal(false)} 
        validSegments={validSegments} 
        translations={translations} 
        fuzzySearchThreshold={fuzzySearchThreshold} 
        onConfirmReplace={handleConfirmReplace}
        onGoToSegment={navigateToSegment}
      />
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
        <h1>
            {transliterationEnabled && transliterationScript === Abjhad.name ? (
                <span style={{ fontFamily: transliterationFont, fontSize: `${transliterationFontSizeMultiplier}em` }}>
                    {Abjhad.transliterate(translatedTitle || source.title)}
                </span>
            ) : (
                translatedTitle || source.title
            )}
        </h1>
        <Stack direction="horizontal" gap={2}>
          <InputGroup size="sm">
            <Button title="Find and replace target text" variant="outline-primary" onClick={() => setShowFindReplaceModal(true)}>🔍</Button>
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
            
            const leftD = leftDelimiters[index].map(d => d.replaceAll('\n', '⏎'));
            const rightD = rightDelimiters[index].map(d => d.replaceAll('\n', '⏎'));
            const isFirstOccurrence = validSegments.indexOf(segment) === index;
            
            return (
              <ListGroup.Item key={index} id={`segment-item-${index}`} className={`d-flex align-items-center ${segType === 'Skip' ? 'list-group-item-light' : ''}`}>
                  {editingSegmentIndex === index ? (
                    !isFirstOccurrence ? (
                      <div className="w-100">
                        {renderSegmentContent(segment, translationData, leftD, rightD)}
                        <Stack direction='horizontal' gap={1} className="mt-2">
                          <Button variant="success" size="sm" onClick={() => {
                            handleCancel();
                            if (index < validSegments.length - 1) {
                              handleEdit(validSegments[index + 1], index + 1);
                            }
                          }} title="Skip to the next segment for editing">Edit next</Button>
                          <Button variant="primary" size="sm" className="ml-2" onClick={() => {
                            handleCancel();
                            const firstIndex = validSegments.indexOf(segment);
                            if (firstIndex >= visibleSegmentCount) {
                              setVisibleSegmentCount(firstIndex + 50);
                            }
                            setTimeout(() => {
                              const element = document.getElementById(`segment-item-${firstIndex}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.classList.add('highlight-scroll');
                                setTimeout(() => {
                                  element.classList.remove('highlight-scroll');
                                }, 1500);
                              }
                              handleEdit(validSegments[firstIndex], firstIndex);
                            }, 0);
                          }} title="Navigate to editable main segment for this duplicate">Edit this</Button>
                          <Button variant="warning" size="sm" className="ml-2" onClick={() => handleDisconnect(segment, index)} title="Disconnect duplicate segment">Disconnect</Button>
                          <Button variant="secondary" size="sm" className="ml-2" onClick={handleCancel}>Cancel</Button>
                        </Stack>
                      </div>
                    ) : (
                      <div className="w-100">
                      <div>
                        {getDelimiterBadges(leftD, 'left')}
                        <UnderlinedText text={segment} memories={memories} onMemoryClick={handleMemoryClick} onMemoriesNumbered={onMemoriesNumbered} memoryVersion={memoryVersion} />
                        {getDelimiterBadges(rightD, 'right')}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <SpellCheckEditor 
                          value={currentTranslation} 
                          onChange={setCurrentTranslation} 
                          onDiagnosticsChange={setDiagnostics}
                          autofocus={editingSegmentIndex === index}
                          numberedMemories={numberedMemories}
                          isDirty={isDirty}
                        />
                        <CloseButton
                          style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}
                          title="Clear target text"
                          onClick={() => handleClearAndSave(segment)}
                          disabled={!currentTranslation}
                        />
                      </div>
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
                    )
                  ) : (
                    <div className="d-flex justify-content-between align-items-center w-100">
                      {renderSegmentContent(segment, translationData, leftD, rightD)}
                      <Stack direction='horizontal'>
                        {noteText && <span title={`Note: ${noteText}`} style={{ paddingRight: '1em' }}>🗒️</span>}
                        {bookmarkData && <span title={`${bookmarkData.name}${bookmarkData.comment ? `:\n${bookmarkData.comment}` : ''}`} style={{ paddingRight: '1em' }}>🔖</span>}
                        <Button variant="link" title='Edit segment' onClick={() => confirmAndProceed(() => handleEdit(segment, index))} style={{textDecoration: 'none'}}>✏️</Button>
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