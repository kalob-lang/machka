import React, { useState, useEffect, useMemo } from 'react';
import { Form, Button, Card, Collapse, InputGroup, Badge, Stack } from 'react-bootstrap';
import { Source } from '../App';
import { useApp } from '../AppContext';
import { useSource } from '../SourceContext';
import pako from 'pako';
import ModeHelpAlert from './ModeHelpAlert';

// Helper to decode from base64 Uint8Array
const atobUint8Array = (b64: string) => {
  const byteCharacters = atob(b64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
}

interface MemoryEditorProps {
  allSources: Source[];
  memoryVersion: number;
  onSourceUpdate: (updatedSource: Source) => void;
  onMemoryUpdate: () => void;
  onNavigateToSegment: (segmentIndex: number) => void;
  scrollToMemory?: string | null;
  onScrollToMemoryHandled?: () => void;
}

interface ImportedMemory {
  target: string;
  sourceTitle: string;
}

interface Usage {
  text: string;
  index: number;
}

interface ProcessedMemory {
  target: string;
  alternatives: string[];
  sourceTitle?: string;
  usage: Usage[];
}

const MemoryEditor: React.FC<MemoryEditorProps> = ({ allSources, memoryVersion, onSourceUpdate, onMemoryUpdate, onNavigateToSegment, scrollToMemory, onScrollToMemoryHandled }) => {
  const { source, segments } = useSource();
  const { handleSetItem, setError } = useApp();

  const [memories, setMemories] = useState<Record<string, string>>({});
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [importedMemories, setImportedMemories] = useState<Record<string, ImportedMemory>>({});
  const [importSources, setImportSources] = useState<{ id: string; filename: string; }[]>([]);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [addingAlternativeTo, setAddingAlternativeTo] = useState<string | null>(null);
  const [newAlternative, setNewAlternative] = useState('');

  useEffect(() => {
    if (source) {
      setImportSources(source.memoryImports || []);
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
    } else {
      setMemories({});
      setImportSources([]);
    }
  }, [source, memoryVersion, setError]);

  useEffect(() => {
    let allImported: Record<string, ImportedMemory> = {};
    importSources.forEach(imported => {
      const sourceToRead = allSources.find(s => s.id === imported.id);
      if (!sourceToRead) return;

      const sourceTitle = sourceToRead.title || 'Unknown Source';
      const stored = localStorage.getItem(`memories_${sourceToRead.id}`);
      if (stored) {
        try {
          let decompressed = stored;
          if (sourceToRead.compression) {
            decompressed = pako.inflate(atobUint8Array(stored), { to: 'string' });
          }
          const parsedMemories: Record<string, string> = JSON.parse(decompressed);
          for (const sourceText in parsedMemories) {
            if (!allImported[sourceText]) {
              allImported[sourceText] = {
                target: parsedMemories[sourceText],
                sourceTitle: sourceTitle
              };
            }
          }
        } catch (e) {
          console.error(`Failed to parse memories for source ${imported.id}`, e);
        }
      }
    });
    setImportedMemories(allImported);
  }, [importSources, allSources]);
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

  const handleEdit = (sourceText: string) => {
    setEditingMemory(sourceText);
    setCurrentTranslation(memories[sourceText]);
  };

  const handleSave = (sourceText: string) => {
    if (source) {
      const updatedMemories = { ...memories, [sourceText]: currentTranslation };
      if (saveData(`memories_${source.id}`, updatedMemories)) {
        setMemories(updatedMemories);
        setEditingMemory(null);
        onMemoryUpdate();
      }
    }
  };

  const handleDelete = (sourceText: string) => {
    if (source) {
      const updatedMemories = { ...memories };
      delete updatedMemories[sourceText];
      if (saveData(`memories_${source.id}`, updatedMemories)) {
        setMemories(updatedMemories);
        onMemoryUpdate();
      }
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, checked } = e.target;
    if (!source) return;

    const sourceToToggle = allSources.find(s => s.id === id);
    if (!sourceToToggle) return;

    const newImportSources = checked
      ? [...importSources, { id: sourceToToggle.id, filename: sourceToToggle.filename }]
      : importSources.filter(s => s.id !== id);
    
    setImportSources(newImportSources);
    onSourceUpdate({ ...source, memoryImports: newImportSources });
  };

  const handleSaveAlternative = (mainSourceText: string) => {
    if (source && newAlternative) {
      const updatedMemories = { ...memories, [newAlternative]: `@${mainSourceText}` };
      if (saveData(`memories_${source.id}`, updatedMemories)) {
        setMemories(updatedMemories);
        setAddingAlternativeTo(null);
        setNewAlternative('');
        onMemoryUpdate();
      }
    }
  };

  const handleDeleteAlternative = (alternativeText: string) => {
    if (source) {
      const updatedMemories = { ...memories };
      delete updatedMemories[alternativeText];
      if (saveData(`memories_${source.id}`, updatedMemories)) {
        setMemories(updatedMemories);
        onMemoryUpdate();
      }
    }
  };

  const getMemoryUsage = (memoryText: string): Usage[] => {
    if (!source) return [];
    return segments.map((segment, index) => {
        if (new RegExp(`\\b${memoryText}\\b`, 'ui').test(segment)) {
          return { text: `Segment ${index + 1}`, index: index };
        } else if (segment.includes(memoryText)) {
          return { text: `⚠️ Segment ${index + 1}`, index: index };
        }
        return null;
    }).filter((u): u is Usage => u !== null);
  };

  const finalMemories = useMemo(() => {
    const processed: Record<string, ProcessedMemory> = {};
    const allMems = { ...importedMemories, ...memories };

    // First pass: identify main memories and initialize
    for (const sourceText in allMems) {
      const value = allMems[sourceText];
      const target = typeof value === 'object' ? value.target : value;
      if (!target.startsWith('@')) {
        const usage = getMemoryUsage(sourceText);
        if (usage.length > 0) {
          processed[sourceText] = {
            target: target,
            alternatives: [],
            usage: usage,
            sourceTitle: typeof value === 'object' ? value.sourceTitle : undefined
          };
        }
      }
    }

    // Second pass: associate alternatives
    for (const sourceText in allMems) {
      const value = allMems[sourceText];
      const target = typeof value === 'object' ? value.target : value;
      if (target.startsWith('@')) {
        const mainKey = target.substring(1);
        if (processed[mainKey]) {
          processed[mainKey].alternatives.push(sourceText);
          // Also add usage of alternative to main memory
          const alternativeUsage = getMemoryUsage(sourceText);
          processed[mainKey].usage.push(...alternativeUsage);
        }
      }
    }
    return processed;
  }, [memories, importedMemories, segments]);

  useEffect(() => {
    if (scrollToMemory) {
      setTimeout(() => {
        const element = document.getElementById(`memory-card-${scrollToMemory}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-scroll');
          setTimeout(() => {
            element.classList.remove('highlight-scroll');
          }, 1500);
          onScrollToMemoryHandled?.();
        }
      }, 0);
    }
  }, [scrollToMemory, finalMemories, onScrollToMemoryHandled]);

  const { available, missing } = useMemo(() => {
    const available = allSources.filter(s => s.id !== source?.id);
    const missing = (source?.memoryImports || []).filter(imp => !allSources.some(s => s.id === imp.id));
    return { available, missing };
  }, [allSources, source]);


  if (!source) {
    return <div>
      <ModeHelpAlert mode="memory" className='mt-4' />
      <p>Please select a source from the sidebar to edit memories.</p>
    </div>;
  }

  return (
    <div>
      <div id="memory-editor-title-bar" className="d-flex justify-content-between align-items-center">
        <h1>{source.title}</h1>
        <Stack direction="horizontal" gap={2}>
          <Button 
            onClick={() => setShowImportPanel(!showImportPanel)}
            aria-controls="import-memories-panel"
            aria-expanded={showImportPanel}
            active={showImportPanel}
          >
            Import Memories
          </Button>
        </Stack>
      </div>
    
      <Collapse in={showImportPanel}>
        <div id="import-memories-panel">
          <Card className="mt-2">
            <Card.Body>
              <Form.Group controlId="importSelect">
                <Form.Label>Select sources to import memories from. Memories will only be displayed if there is a segment that contains the source text of the memory.</Form.Label>
                {available.map(s => (
                  <Form.Check 
                    type="checkbox"
                    key={s.id}
                    id={s.id}
                    label={s.filename ?? s.title}
                    checked={importSources.some(is => is.id === s.id)}
                    onChange={handleCheckboxChange}
                  />
                ))}
                {missing.map(ms => (
                  <Form.Check 
                    disabled
                    type="checkbox"
                    key={ms.id}
                    id={ms.id}
                    label={<>{ms.filename} <span title="File not found">⚠️</span></>}
                    checked={true}
                  />
                ))}
              </Form.Group>
            </Card.Body>
          </Card>
        </div>
      </Collapse>

      <div className="mt-4">
        <ModeHelpAlert mode="memory" />
        {Object.entries(finalMemories).map(([sourceText, mem]) => (
          <Card key={sourceText} id={`memory-card-${sourceText}`} className="mb-2">
            {mem.sourceTitle && <Card.Header>{mem.sourceTitle}</Card.Header>}
            <Card.Body>
              <Card.Title>
                {sourceText}
                {mem.alternatives.map(alt => (
                  <Badge key={alt} pill bg="info" className="ms-2">
                    {alt} <span onClick={() => handleDeleteAlternative(alt)} style={{cursor: 'pointer', fontWeight: 'bold'}}>X</span>
                  </Badge>
                ))}
              </Card.Title>
              {editingMemory === sourceText ? (
                <div>
                  <Form.Control 
                    as="textarea" 
                    rows={2} 
                    placeholder="Enter translation" 
                    value={currentTranslation} 
                    onChange={(e) => setCurrentTranslation(e.target.value)} 
                  />
                  <Button variant="primary" size="sm" className="mt-2" onClick={() => handleSave(sourceText)}>Save</Button>
                </div>
              ) : (
                <div>
                  <Card.Text>{mem.target}</Card.Text>
                  {!mem.sourceTitle && (
                    <div>
                      <Button variant="link" onClick={() => handleEdit(sourceText)} style={{textDecoration: 'none'}}>✏️</Button>
                      <Button variant="link" onClick={() => handleDelete(sourceText)} style={{textDecoration: 'none'}}>🗑️</Button>
                      <Button variant="link" onClick={() => setAddingAlternativeTo(sourceText)} style={{textDecoration: 'none'}}>↔️</Button>
                    </div>
                  )}
                </div>
              )}
              {addingAlternativeTo === sourceText && (
                <InputGroup className="mt-2">
                  <Form.Control
                    placeholder="Add alternative spelling"
                    value={newAlternative}
                    onChange={(e) => setNewAlternative(e.target.value)}
                  />
                  <Button variant="outline-secondary" onClick={() => handleSaveAlternative(sourceText)}>Save</Button>
                </InputGroup>
              )}
            </Card.Body>
            <Card.Footer className="text-muted">
              Usage: {mem.usage.length > 0 ? (
                [...new Map(mem.usage.map(item => [item.index, item])).values()].map((u, i, arr) => (
                    <React.Fragment key={u.index}>
                        <Button className='memory-usage-example' variant="link" size="sm" onClick={() => onNavigateToSegment(u.index)} style={{textDecoration: 'none', padding: '0'}}>
                            {u.text}
                        </Button>
                        {i < arr.length - 1 ? ', ' : ''}
                    </React.Fragment>
                ))
              ) : 'None'}
            </Card.Footer>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default MemoryEditor;