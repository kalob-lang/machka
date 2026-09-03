import React, { createContext, useContext, useMemo } from 'react';
import { Source } from './App';
import { useApp } from './AppContext';
import { segmentText } from './utils/segmentation';
import pako from 'pako';

interface SourceContextType {
  source: Source | null;
  segments: string[];
  delimiters: string[];
  decompressedContent: string;
}

export const getCreationDate = (source: Source): number => {
  if (source.created) {
    return source.created;
  }
  try {
    return new Date(source.id.replace(/-part\d+$/, '')).getTime();
  } catch (e) {
    return 0;
  }
};

const SourceContext = createContext<SourceContextType | undefined>(undefined);

export const SourceProvider: React.FC<{ source: Source | null, children: React.ReactNode }> = ({ source, children }) => {
  const { setError } = useApp();

  const decompressedContent = useMemo(() => {
    if (!source) return '';
    if (source.compression) {
      try {
        const binaryString = atob(source.content)
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0))
        return pako.inflate(bytes, { to: 'string' });
      } catch (err: any) {
        setError({ title: 'Decompression Error', message: `Failed to decompress source content: ${err.message}` });
        return source.content; // Return raw content on error
      }
    }
    return source.content;
  }, [source, setError]);

  const { segments, delimiters } = useMemo(() => {
    if (!source) return { segments: [], delimiters: [] };
    const rule = source.segmentationRule || '\n';
    try {
      return segmentText(decompressedContent, rule, source.cancelTriggers || []);
    } catch (e) {
      // Invalid regex, return content as a single segment
      return { segments: [decompressedContent], delimiters: [] };
    }
  }, [source, decompressedContent]);

  return (
    <SourceContext.Provider value={{ source, segments, delimiters, decompressedContent }}>
      {children}
    </SourceContext.Provider>
  );
};

export const useSource = () => {
  const context = useContext(SourceContext);
  if (!context) {
    throw new Error('useSource must be used within a SourceProvider');
  }
  return context;
};