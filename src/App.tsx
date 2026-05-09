import React, { useState, useEffect, useRef } from 'react';
import { Container, Nav, Button, Tabs, Tab, Row, Col, Form, InputGroup, Stack, Dropdown } from 'react-bootstrap';
import './App.css';
import SourceEditor from './components/SourceEditor';
import TranslationEditor from './components/TranslationEditor';
import MemoryEditor from './components/MemoryEditor';
import Settings from './components/Settings';
import AddSourceModal from './components/AddSourceModal';
import SizeBlocker from './components/SizeBlocker';
import { CompressionLevel, useApp } from './AppContext';
import { SourceProvider, getCreationDate } from './SourceContext';
import Resizer from './components/Resizer';
import ImportConflictModal from './components/ImportConflictModal';
import ErrorModal from './components/ErrorModal';
import pako from 'pako';

export interface Source {
  id: string;
  title: string;
  filename: string;
  content: string;
  segmentationRule?: string;
  defaultGrammarRule?: string;
  created?: number;
  modified?: number;
  compression?: boolean;
  compressionLevel?: CompressionLevel;
  memoryImports?: { id: string; filename: string; }[];
}

// Helper to decode from base64 Uint8Array
const atobUint8Array = (b64: string) => {
  const byteCharacters = atob(b64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
}

type SortOrder = 'Oldest First' | 'Newest First' | 'Most Recently Modified' | 'Least Recently Modified' | 'Longest Source' | 'Shortest Source' | 'Most Translated' | 'Least Translated' | 'Alphabetical';

interface Heading {
  text: string;
  index: number;
  level: string;
}

interface TreeNode extends Heading {
  children: TreeNode[];
}

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const storedWidth = localStorage.getItem('sidebarWidth');
    return storedWidth ? parseInt(storedWidth, 10) : 300;
  });
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [isScreenTooSmall, setIsScreenTooSmall] = useState(window.innerWidth < 800);
  const [sourceFilter, setSourceFilter] = useState(() => localStorage.getItem('sourceFilter') || '');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => (localStorage.getItem('sortOrder') as SortOrder) || 'Alphabetical');
  const [conflictData, setConflictData] = useState<any | null>(null);
  const [translationsVersion, setTranslationsVersion] = useState(0);
  const [memoryVersion, setMemoryVersion] = useState(0);
  const [expandedOutlines, setExpandedOutlines] = useState<Record<string, boolean>>({});
  const [scrollToSegment, setScrollToSegment] = useState<{ sourceId: string; segmentIndex: number; } | null>(null);
  const [activeTab, setActiveTab] = useState('source');
  const [showSourcePreview, setShowSourcePreview] = useState(false);
  const [scrollToPreviewForSource, setScrollToPreviewForSource] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const {
    theme, error, setError, handleSetItem, updateStorageVersion,
    defaultCompression, defaultCompressionLevel, sourceSelectionLocation,
    translationSanitization
  } = useApp();

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = ''; // Required for Chrome
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    const themeLink = document.getElementById('theme-link') as HTMLLinkElement;
    if (themeLink) {
      themeLink.href = `/machka/bootstrap/${theme}/bootstrap.min.css`;
    }
    const htmlElement = document.documentElement
    htmlElement.setAttribute('data-theme', theme)
  }, [theme]);

  useEffect(() => {
    const handleResize = () => {
      setIsScreenTooSmall(window.innerWidth < 800);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const storedSources = localStorage.getItem('sources');
    if (storedSources) {
      setSources(JSON.parse(storedSources));
    }
  }, []);

  useEffect(() => {
    const baseTitle = "uywng Machka";
    if (selectedSource && selectedSource.filename) {
      document.title = `${selectedSource.filename} - ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [selectedSource]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const widthRef = useRef(sidebarWidth);

  useEffect(() => {
    widthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleResize = (delta: number) => {
    setSidebarWidth(prevWidth => {
      const newWidth = prevWidth + delta;
      if (newWidth > 100 && newWidth < 500) { // Min and max width
        return newWidth;
      }
      return prevWidth;
    });
  };

  const handleResizeEnd = () => {
    handleSetItem('sidebarWidth', String(widthRef.current));
  };

  const findFirstIncompleteSegment = (source: Source): number => {
    const rawTranslations = localStorage.getItem(`translations_${source.id}`);
    if (!rawTranslations) return 0;
  
    try {
      let decompressed = rawTranslations;
      if (source.compression) {
        decompressed = pako.inflate(atobUint8Array(rawTranslations), { to: 'string' });
      }
      const translations = JSON.parse(decompressed);
      const rule = source.segmentationRule || '\n';
      const segments = source.content.split(new RegExp(rule)).map(s => s.trim()).filter(Boolean);
  
      const firstIncompleteIndex = segments.findIndex(seg => {
        const translationData = translations[seg];
        const text = (typeof translationData === 'object' && translationData !== null) ? translationData.text : translationData;
        return !text && translationData?.segmentType !== 'Skip';
      });
  
      return firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex;
    } catch (e) {
      console.error("Failed to find incomplete segment", e);
      return 0;
    }
  };

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

  const handleSelectSource = (source: Source) => {
    confirmAndProceed(() => {
      setSelectedSource(source);
      setExpandedOutlines(prev => ({
        [source.id]: prev[source.id] || false
      }));

      switch (sourceSelectionLocation) {
        case 'translation-first':
          setActiveTab('translation');
          setScrollToSegment({ sourceId: source.id, segmentIndex: 0 });
          setShowSourcePreview(false);
          break;
        case 'translation-incomplete':
          setActiveTab('translation');
          const incompleteIndex = findFirstIncompleteSegment(source);
          setScrollToSegment({ sourceId: source.id, segmentIndex: incompleteIndex });
          setShowSourcePreview(false);
          break;
        case 'source-preview':
          setActiveTab('source');
          setShowSourcePreview(true);
          setScrollToPreviewForSource(source.id);
          break;
        case 'source-top':
        default:
          setActiveTab('source');
          setShowSourcePreview(false);
          break;
      }
    });
  }

  const handleAddSource = (title: string, content: string) => {
    confirmAndProceed(() => {
      const now = Date.now();
      const newSource: Source = {
        id: new Date().toISOString(),
        title,
        filename: title,
        content,
        created: now,
        modified: now,
        compression: defaultCompression,
        compressionLevel: defaultCompressionLevel
      };

      let finalContent = content;
      if (newSource.compression) {
        try {
          finalContent = btoa(String.fromCharCode(...pako.deflate(content, { level: newSource.compressionLevel })));
          newSource.content = finalContent;
        } catch (err: any) {
          setError({ title: 'Compression Error', message: `Failed to compress new source: ${err.message}` });
          return;
        }
      }

      const updatedSources = [...sources, newSource];
      let success = handleSetItem('sources', JSON.stringify(updatedSources));
      if (!success) return;

      const emptyData = ['{}', '{}', '[]'];
      const keys = [`translations_${newSource.id}`, `memories_${newSource.id}`, `delimiters_${newSource.id}`];

      for (let i = 0; i < keys.length; i++) {
        let valueToStore = emptyData[i];
        if (newSource.compression) {
          try {
            valueToStore = btoa(String.fromCharCode(...pako.deflate(valueToStore, { level: newSource.compressionLevel })));
          } catch (err: any) {
            setError({ title: 'Compression Error', message: `Failed to create compressed data for new source: ${err.message}` });
            return;
          }
        }
        success = success && handleSetItem(keys[i], valueToStore);
        if (!success) return;
      }

      setSources(updatedSources);
    });
  };

  const handleSourceUpdate = (updatedSource: Source) => {
    const updatedSources = sources.map(s => s.id === updatedSource.id ? { ...updatedSource, modified: Date.now() } : s);
    if (handleSetItem('sources', JSON.stringify(updatedSources))) {
      setSources(updatedSources);
      setSelectedSource({ ...updatedSource, modified: Date.now() });
    }
  };

  const handleDeleteSource = (sourceId: string) => {
    const updatedSources = sources.filter(s => s.id !== sourceId);
    if (handleSetItem('sources', JSON.stringify(updatedSources))) {
      setSources(updatedSources);
      localStorage.removeItem(`translations_${sourceId}`);
      localStorage.removeItem(`memories_${sourceId}`);
      localStorage.removeItem(`delimiters_${sourceId}`);
      updateStorageVersion();
      if (selectedSource?.id === sourceId) {
        setSelectedSource(null);
      }
    }
  };

  const handleDuplicateSource = (source: Source) => {
    const now = Date.now();
    const newSource: Source = {
      ...source,
      id: new Date().toISOString(),
      filename: `${source.filename} (Copy)`,
      created: now,
      modified: now,
    };
    const updatedSources = [...sources, newSource];
    if (handleSetItem('sources', JSON.stringify(updatedSources))) {
      setSources(updatedSources);
    }
  };

  const handleSplitSource = (originalSource: Source, splitIndex: number) => {
    const rule = originalSource.segmentationRule || '\n';
    const wrappedRule = `(${rule})`;
    const allSegmentsAndDelimiters = originalSource.content.split(new RegExp(wrappedRule));
    
    const slicePoint = splitIndex * 2;
    const content1 = allSegmentsAndDelimiters.slice(0, slicePoint).join('');
    const content2 = allSegmentsAndDelimiters.slice(slicePoint).join('');

    const originalFilename = originalSource.filename ?? originalSource.title
    const baseFilename = originalFilename.replace(/ - Part \d+$/, '');
    const partRegex = / - Part (\d+)$/;
    const match = originalFilename.match(partRegex);
    const startPart = match ? parseInt(match[1], 10) : 1;
    const now = Date.now();

    const source1: Source = {
      ...originalSource,
      id: new Date().toISOString() + '-part1',
      title: originalSource.title,
      filename: `${baseFilename} - Part ${startPart}`,
      content: content1,
      created: now,
      modified: now,
    };

    const source2: Source = {
      ...originalSource,
      id: new Date().toISOString() + '-part2',
      title: originalSource.title,
      filename: `${baseFilename} - Part ${startPart + 1}`,
      content: content2,
      created: now,
      modified: now,
    };

    const updatedSources = [...sources.filter(s => s.id !== originalSource.id), source1, source2];
    if (handleSetItem('sources', JSON.stringify(updatedSources))) {
      setSources(updatedSources);
      localStorage.removeItem(`translations_${originalSource.id}`);
      localStorage.removeItem(`memories_${originalSource.id}`);
      localStorage.removeItem(`delimiters_${originalSource.id}`);
      updateStorageVersion();
      setSelectedSource(source2);
    }
  };

  const handleImportMachka = (data: any) => {
    confirmAndProceed(() => {
      const existingSource = sources.find(s => s.filename === data.source.filename);
      if (existingSource) {
        setConflictData({ ...data, existingSourceId: existingSource.id });
      } else {
        finalizeImport(data, data.source.filename);
      }
    });
  };

  const finalizeImport = (data: any, newFilename?: string) => {
    const { source, translations, memories, delimiters } = data;
    const newId = new Date().toISOString();
    const now = Date.now();
    
    const compression = source.compression === undefined ? defaultCompression : source.compression;
    const compressionLevel = source.compressionLevel === undefined ? defaultCompressionLevel : source.compressionLevel;

    const newSource = { 
      ...source, 
      id: newId, 
      created: getCreationDate(source) || now,
      modified: now, 
      filename: newFilename || source.filename, 
      compression, 
      compressionLevel 
    };

    if (newSource.compression) {
      let isContentCompressed = false;
      try {
        atob(newSource.content);
        isContentCompressed = true;
      } catch (e) {
        isContentCompressed = false;
      }

      if (!isContentCompressed) {
        try {
          const compressedContent = btoa(String.fromCharCode(...pako.deflate(newSource.content, { level: newSource.compressionLevel })));
          newSource.content = compressedContent;
        } catch (err: any) {
          setError({ title: 'Compression Error', message: `Failed to compress imported source content: ${err.message}` });
          return;
        }
      }
    }

    const updatedSources = newFilename ? [...sources, newSource] : sources.map(s => s.id === data.existingSourceId ? newSource : s);
    
    let success = handleSetItem('sources', JSON.stringify(updatedSources));
    if (!success) return;

    const itemsToStore: { [key: string]: any } = {
      [`translations_${newId}`]: translations,
      [`memories_${newId}`]: memories,
      [`delimiters_${newId}`]: delimiters,
    };

    for (const key in itemsToStore) {
      if (!success) break;
      let value = itemsToStore[key];
      let valueToStore = value;

      let isCurrentlyCompressed = false;
      try {
        JSON.parse(value);
        isCurrentlyCompressed = false;
      } catch (e) {
        isCurrentlyCompressed = true;
      }

      if (newSource.compression && !isCurrentlyCompressed) {
        try {
          const compressed = pako.deflate(value, { level: newSource.compressionLevel });
          valueToStore = btoa(String.fromCharCode(...compressed));
        } catch (err: any) {
          setError({ title: 'Compression Error', message: `Failed to compress imported data for ${key}: ${err.message}` });
          success = false; continue;
        }
      } else if (!newSource.compression && isCurrentlyCompressed) {
        try {
          valueToStore = pako.inflate(atobUint8Array(value), { to: 'string' });
        } catch (err: any) {
          setError({ title: 'Decompression Error', message: `Failed to decompress imported data for ${key}: ${err.message}` });
          success = false; continue;
        }
      }

      success = success && handleSetItem(key, valueToStore);
    }

    if (success) {
      setSources(updatedSources);
      setConflictData(null);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if(handleSetItem('sourceFilter', value)) {
      setSourceFilter(value);
    }
  };

  const clearFilter = () => {
    setSourceFilter('');
    localStorage.removeItem('sourceFilter');
    updateStorageVersion();
  };

  const handleSortChange = (order: SortOrder) => {
    if(handleSetItem('sortOrder', order)) {
      setSortOrder(order);
    }
  };

  const handleTranslationsUpdate = () => {
    setTranslationsVersion(v => v + 1);
    updateStorageVersion();
  };

  const handleMemoryUpdate = () => {
    setMemoryVersion(v => v + 1);
    updateStorageVersion();
  };

  const handleNavigateToSegment = (sourceId: string, segmentIndex: number) => {
    confirmAndProceed(() => {
      const sourceToSelect = sources.find(s => s.id === sourceId);
      if (sourceToSelect) {
        if (selectedSource?.id !== sourceId) {
          setSelectedSource(sourceToSelect);
        }
        setActiveTab('translation');
        setScrollToSegment({ sourceId, segmentIndex });
      }
    });
  };

  const toggleOutline = (sourceId: string) => {
    setExpandedOutlines(prev => ({ ...prev, [sourceId]: !prev[sourceId] }));
  };

  const sortedAndFilteredSources = [...sources]
    .filter(source => (source.filename ?? source.title).toLowerCase().includes(sourceFilter.toLowerCase()))
    .sort((a, b) => {
      switch (sortOrder) {
        case 'Oldest First': return getCreationDate(a) - getCreationDate(b);
        case 'Newest First': return getCreationDate(b) - getCreationDate(a);
        case 'Most Recently Modified': return (b.modified || 0) - (a.modified || 0);
        case 'Least Recently Modified': return (a.modified || 0) - (b.modified || 0);
        case 'Longest Source': return b.content.length - a.content.length;
        case 'Shortest Source': return a.content.length - b.content.length;
        case 'Most Translated':
        case 'Least Translated': {
          const getTranslationCount = (source: Source) => {
            const raw = localStorage.getItem(`translations_${source.id}`);
            if (!raw) return 0;
            try {
              let data = raw;
              if (source.compression) {
                data = pako.inflate(atobUint8Array(raw), { to: 'string' })
              }
              return Object.keys(JSON.parse(data) || {}).length;
            } catch (e) {
              return 0;
            }
          };
          const aCount = getTranslationCount(a);
          const bCount = getTranslationCount(b);
          return sortOrder === 'Most Translated' ? bCount - aCount : aCount - bCount;
        }
        case 'Alphabetical':
        default: {
          const cleanA = (a.filename ?? a.title).replace(/^(the|a|an)\s+/i, '');
          const cleanB = (b.filename ?? b.title).replace(/^(the|a|an)\s+/i, '');
          return cleanA.localeCompare(cleanB);
        }
      }
    });

  const getHeadings = (source: Source): Heading[] => {
    const rawTranslations = localStorage.getItem(`translations_${source.id}`);
    if (!rawTranslations) return [];
    try {
      let decompressed = rawTranslations;
      if (source.compression) {
        decompressed = pako.inflate(atobUint8Array(rawTranslations), { to: 'string' });
      }
      const translations = JSON.parse(decompressed);
      const rule = source.segmentationRule || '\n';
      const segments = source.content.split(new RegExp(rule)).map(s => s.trim()).filter(Boolean);
      
      return segments.map((seg, index) => {
        const transData = translations[seg];
        if (transData?.segmentType === 'Heading' && transData?.outlineLevel !== 'Skip') {
          return { text: transData.text || seg, index, level: transData.outlineLevel };
        }
        return null;
      }).filter((h): h is Heading => h !== null);
    } catch (e) {
      return [];
    }
  };

  const buildTree = (headings: Heading[]): TreeNode[] => {
    const getLevelNumber = (level: string): number => parseInt(level.replace('Level ', ''), 10);
    const tree: TreeNode[] = [];
    const path: TreeNode[] = []; // A stack to keep track of the current parent lineage

    headings.forEach(heading => {
        let currentLevel = getLevelNumber(heading.level);
        const node: TreeNode = { ...heading, children: [] };

        const parentLevel = path.length > 0 ? getLevelNumber(path[path.length - 1].level) : 1; // Treat root as level 1

        if (currentLevel > parentLevel + 1) {
            currentLevel = parentLevel + 1;
            node.level = `Level ${currentLevel}`;
        }

        while (path.length > 0 && getLevelNumber(path[path.length - 1].level) >= currentLevel) {
            path.pop();
        }

        if (path.length === 0) {
            tree.push(node);
        } else {
            path[path.length - 1].children.push(node);
        }

        path.push(node);
    });

    return tree;
  }

  const renderTree = (nodes: TreeNode[], sourceId: string): React.ReactElement | null => {
    if (!nodes || nodes.length === 0) return null;

    return (
      <ul>
        {nodes.map(node => (
          <li key={node.index}>
            <Nav.Link onClick={() => handleNavigateToSegment(sourceId, node.index)}>
              {node.text}
            </Nav.Link>
            {renderTree(node.children, sourceId)}
          </li>
        ))}
      </ul>
    );
  };

  if (isScreenTooSmall) {
    return <SizeBlocker />;
  }

  return (
    <SourceProvider source={selectedSource}>
      <div className={`d-flex ${sidebarOpen ? 'toggled' : ''}`} id="wrapper">
        <div className="bg-light border-right" id="sidebar-wrapper" style={{ width: sidebarOpen ? sidebarWidth : 0 }}>
          <div className="sidebar-heading">
            <Stack direction='horizontal' gap={1}>
              <span>Your Sources</span>
              <Dropdown onSelect={(e) => handleSortChange(e as SortOrder)} className='ms-auto' >
                <Dropdown.Toggle variant="outline-secondary"  id="dropdown-basic">
                  Sort
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item eventKey="Alphabetical">Alphabetical</Dropdown.Item>
                  <Dropdown.Item eventKey="Oldest First">Oldest First</Dropdown.Item>
                  <Dropdown.Item eventKey="Newest First">Newest First</Dropdown.Item>
                  <Dropdown.Item eventKey="Most Recently Modified">Most Recently Modified</Dropdown.Item>
                  <Dropdown.Item eventKey="Least Recently Modified">Least Recently Modified</Dropdown.Item>
                  <Dropdown.Item eventKey="Longest Source">Longest Source</Dropdown.Item>
                  <Dropdown.Item eventKey="Shortest Source">Shortest Source</Dropdown.Item>
                  <Dropdown.Item eventKey="Most Translated">Most Translated</Dropdown.Item>
                  <Dropdown.Item eventKey="Least Translated">Least Translated</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              <Button variant='outline-info' onClick={() => setShowAddSourceModal(true)}>+</Button>
            </Stack>
          </div>
          <div className="p-2">
            <Stack direction='horizontal'>
              <Form.Control 
                type="text" 
                placeholder="Filter sources..." 
                value={sourceFilter} 
                onChange={handleFilterChange} 
              />
              {sourceFilter && <Button variant="danger"  className="mt-1" onClick={clearFilter} id='sidebar-clear-search-button'>X</Button>}
            </Stack>
            
          </div>
          <Nav className="flex-column" navbarScroll>
            {sortedAndFilteredSources.map(source => {
              const headings = getHeadings(source);
              return (
                <React.Fragment key={source.id}>
                  <Stack direction='horizontal' className={selectedSource?.id === source.id ? 'bg-info text-bg-info' : ''}>
                    <Nav.Link onClick={() => handleSelectSource(source)} className='flex-grow-1'>
                      {source.filename ?? source.title}
                    </Nav.Link>
                    {selectedSource?.id === source.id && headings.length > 0 && (
                      <span style={{marginRight: '0.5em', cursor: expandedOutlines[source.id] ? 'n-resize' : 's-resize'}} onClick={() => toggleOutline(source.id)} className="ms-auto p-2">{expandedOutlines[source.id] ? '▼' : '▶'}</span>
                    )}
                  </Stack>
                  {expandedOutlines[source.id] && (
                    <div className="tree-outline">
                      {renderTree(buildTree(headings), source.id)}
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </Nav>
        </div>
        <Resizer onResize={handleResize} onResizeEnd={handleResizeEnd} />
        <div id="page-content-wrapper">
          <div className="page-content">
            <Container fluid>
              <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'source')}>
                <Row className="align-items-center header-row">
                  <Nav fill variant='pills' className='flex-row'>
                    <Nav.Item>
                      <Nav.Link title='Toggle source list' onClick={toggleSidebar}>{sidebarOpen ? '◀' : '▶'}</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey='source'>Source</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey='translation'>Translation</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey='memory'>Memories</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link eventKey='settings'>Settings</Nav.Link>
                    </Nav.Item>
                    <Nav.Item>
                      <Nav.Link target='_blank' href='https://github.com/kalob/machka/issues/new'>Report Issue 🚨</Nav.Link>
                    </Nav.Item>
                  </Nav>
                </Row>
                <Row>
                  <Tab.Content>
                      <Tab.Pane eventKey="source">
                        <SourceEditor 
                          onSourceUpdate={handleSourceUpdate} 
                          onDelete={handleDeleteSource} 
                          onDuplicate={handleDuplicateSource} 
                          allSources={sources} 
                          translationsVersion={translationsVersion} 
                          showPreview={showSourcePreview}
                          onTogglePreview={() => setShowSourcePreview(!showSourcePreview)}
                          shouldScrollToPreview={scrollToPreviewForSource === selectedSource?.id}
                          onScrolledToPreview={() => setScrollToPreviewForSource(null)}
                          translationSanitization={translationSanitization}
                        />
                      </Tab.Pane>
                      <Tab.Pane eventKey="translation">
                        <TranslationEditor onSplit={handleSplitSource} onTranslationsUpdate={handleTranslationsUpdate} onMemoryUpdate={handleMemoryUpdate} memoryVersion={memoryVersion} scrollToSegment={scrollToSegment} onScrollToSegmentHandled={() => setScrollToSegment(null)} isDirty={isDirty} setIsDirty={setIsDirty} />
                      </Tab.Pane>
                      <Tab.Pane eventKey="memory">
                        <MemoryEditor 
                          allSources={sources} 
                          memoryVersion={memoryVersion} 
                          onSourceUpdate={handleSourceUpdate} 
                          onMemoryUpdate={handleMemoryUpdate}
                          onNavigateToSegment={(segmentIndex) => {
                            if (selectedSource) {
                              handleNavigateToSegment(selectedSource.id, segmentIndex);
                            }
                          }}
                        />
                      </Tab.Pane>
                    <Tab.Pane eventKey="settings">
                      <Settings />
                    </Tab.Pane>
                  </Tab.Content>
                </Row>
              </Tab.Container>
            </Container>
          </div>
          <footer className='mt-auto'>
              <div className='text-center p-4' style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}>
                © 2025 Copyright: <a className='text-reset fw-bold' href='https://kalob.github.io/'>
                  Kalob Institute
                </a>
              </div>
          </footer>
        </div>
        <AddSourceModal 
          show={showAddSourceModal} 
          onHide={() => setShowAddSourceModal(false)} 
          onAddSource={handleAddSource} 
          onImport={handleImportMachka}
        />
        {conflictData && (
          <ImportConflictModal 
            show={!!conflictData}
            onHide={() => setConflictData(null)}
            onOverwrite={() => finalizeImport(conflictData)}
            onRename={(newFilename) => finalizeImport(conflictData, newFilename)}
            existingFilename={conflictData.source.filename}
            sources={sources}
          />
        )}
        {error && (
          <ErrorModal 
            show={!!error}
            onHide={() => setError(null)}
            title={error.title}
            message={error.message}
          />
        )}
      </div>
    </SourceProvider>
  );
}

export default App;