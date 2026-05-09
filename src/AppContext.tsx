import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';

export type CompressionLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
export type SourceSelectionLocation = 'translation-first' | 'translation-incomplete' | 'source-top' | 'source-preview';

interface AppContextType {
  theme: string;
  setTheme: (theme: string) => void;
  spellCheck: boolean;
  setSpellCheck: (value: boolean) => void;
  autocomplete: boolean;
  setAutocomplete: (value: boolean) => void;
  wiktionarySearch: string;
  setWiktionarySearch: (value: string) => void;
  error: { title: string; message: React.ReactNode } | null;
  setError: (error: { title: string; message: React.ReactNode } | null) => void;
  handleSetItem: (key: string, value: string) => boolean;
  storageVersion: number;
  updateStorageVersion: () => void;
  defaultCompression: boolean;
  setDefaultCompression: (value: boolean) => void;
  defaultCompressionLevel: CompressionLevel;
  setDefaultCompressionLevel: (value: CompressionLevel) => void;
  sourceSelectionLocation: SourceSelectionLocation;
  handleSetSourceSelectionLocation: (value: SourceSelectionLocation) => void;
  showModeHelp: boolean;
  setShowModeHelp: (value: boolean) => void;
  translationSanitization: boolean;
  setTranslationSanitization: (value: boolean) => void;
  scrollingReturnButtonsEnabled: boolean;
  setScrollingReturnButtonsEnabled: (value: boolean) => void;
  scrollingReturnButtonsSensitivity: number;
  setScrollingReturnButtonsSensitivity: (value: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, rawSetTheme] = useState(() => localStorage.getItem('yon-mocko-theme') || 'brite');
  const [spellCheck, rawSetSpellCheck] = useState(() => localStorage.getItem('spellCheck') !== 'true');
  const [autocomplete, rawSetAutocomplete] = useState(() => localStorage.getItem('autocomplete') !== 'true');
  const [wiktionarySearch, rawSetWiktionarySearch] = useState(() => localStorage.getItem('wiktionarySearch') || 'modal');
  const [error, setError] = useState<{ title: string; message: React.ReactNode } | null>(null);
  const [storageVersion, setStorageVersion] = useState(0);
  const [defaultCompression, rawSetDefaultCompression] = useState(() => localStorage.getItem('defaultCompression') === 'true');
  const [defaultCompressionLevel, rawSetDefaultCompressionLevel] = useState<CompressionLevel>(() => parseInt(localStorage.getItem('defaultCompressionLevel') || '1', 10) as CompressionLevel);
  const [sourceSelectionLocation, setSourceSelectionLocation] = useState<SourceSelectionLocation>(() => (localStorage.getItem('sourceSelectionLocation') as SourceSelectionLocation) || 'source-top');
  const [showModeHelp, rawSetShowModeHelp] = useState(() => localStorage.getItem('showModeHelp') !== 'false');
  const [translationSanitization, rawSetTranslationSanitization] = useState(() => localStorage.getItem('translationSanitization') !== 'false');
  const [scrollingReturnButtonsEnabled, rawSetScrollingReturnButtonsEnabled] = useState(() => localStorage.getItem('scrollingReturnButtonsEnabled') !== 'false');
  const [scrollingReturnButtonsSensitivity, rawSetScrollingReturnButtonsSensitivity] = useState(() => parseInt(localStorage.getItem('scrollingReturnButtonsSensitivity') || '5', 10));


  const updateStorageVersion = useCallback(() => setStorageVersion(v => v + 1), []);

  const handleSetItem = useCallback((key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      updateStorageVersion();
      return true;
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
        setError({ title: 'Storage Quota Exceeded', message: 'Your browser\'s local storage is full. Please clear some space or export and delete some sources to continue.' });
        return false;
      } else {
        setError({ title: 'Storage Error', message: `An unexpected error occurred while saving data: ${e.message}` });
        throw e;
      }
    }
  }, [updateStorageVersion]);

  const setTheme = useCallback((newTheme: string) => {
    if (handleSetItem('yon-mocko-theme', newTheme)) {
      rawSetTheme(newTheme);
    }
  }, [handleSetItem]);



  const setSpellCheck = useCallback((value: boolean) => {
    if (handleSetItem('spellCheck', String(value))) {
      rawSetSpellCheck(value);
    }
  }, [handleSetItem]);

  const setAutocomplete = useCallback((value: boolean) => {
    if (handleSetItem('autocomplete', String(value))) {
      rawSetAutocomplete(value);
    }
  }, [handleSetItem]);

  const setWiktionarySearch = useCallback((value: string) => {
    if (handleSetItem('wiktionarySearch', value)) {
      rawSetWiktionarySearch(value);
    }
  }, [handleSetItem]);



  const setDefaultCompression = useCallback((value: boolean) => {
    if (handleSetItem('defaultCompression', String(value))) {
      rawSetDefaultCompression(value);
    }
  }, [handleSetItem]);

  const setDefaultCompressionLevel = useCallback((value: CompressionLevel) => {
    if (handleSetItem('defaultCompressionLevel', String(value))) {
      rawSetDefaultCompressionLevel(value);
    }
  }, [handleSetItem]);

  const handleSetSourceSelectionLocation = (value: SourceSelectionLocation) => {
    if (handleSetItem('sourceSelectionLocation', value)) {
        setSourceSelectionLocation(value);
    }
  };

  const setShowModeHelp = useCallback((value: boolean) => {
    if (handleSetItem('showModeHelp', String(value))) {
      rawSetShowModeHelp(value);
    }
  }, [handleSetItem]);

  const setTranslationSanitization = useCallback((value: boolean) => {
    if (handleSetItem('translationSanitization', String(value))) {
      rawSetTranslationSanitization(value);
    }
  }, [handleSetItem]);

  const setScrollingReturnButtonsEnabled = useCallback((value: boolean) => {
    if (handleSetItem('scrollingReturnButtonsEnabled', String(value))) {
      rawSetScrollingReturnButtonsEnabled(value);
    }
  }, [handleSetItem]);

  const setScrollingReturnButtonsSensitivity = useCallback((value: number) => {
    if (handleSetItem('scrollingReturnButtonsSensitivity', String(value))) {
      rawSetScrollingReturnButtonsSensitivity(value);
    }
  }, [handleSetItem]);

  useEffect(() => {
    updateStorageVersion(); // Initial calculation
  }, [updateStorageVersion]);

  return (
    <AppContext.Provider value={useMemo(() => ({
      theme, setTheme,
      spellCheck, setSpellCheck,
      autocomplete, setAutocomplete,
      wiktionarySearch, setWiktionarySearch,
      error, setError,
      handleSetItem,
      storageVersion,
      updateStorageVersion,
      defaultCompression,
      setDefaultCompression,
      defaultCompressionLevel,
      setDefaultCompressionLevel,
      sourceSelectionLocation,
      handleSetSourceSelectionLocation,
      showModeHelp,
      setShowModeHelp,
      translationSanitization,
      setTranslationSanitization,
      scrollingReturnButtonsEnabled,
      setScrollingReturnButtonsEnabled,
      scrollingReturnButtonsSensitivity,
      setScrollingReturnButtonsSensitivity
    }), [ theme, setTheme, spellCheck, setSpellCheck, autocomplete, setAutocomplete, wiktionarySearch, setWiktionarySearch, error, handleSetItem, storageVersion, updateStorageVersion, defaultCompression, setDefaultCompression, defaultCompressionLevel, setDefaultCompressionLevel, sourceSelectionLocation, handleSetSourceSelectionLocation, showModeHelp, setShowModeHelp, translationSanitization, setTranslationSanitization, scrollingReturnButtonsEnabled, setScrollingReturnButtonsEnabled, scrollingReturnButtonsSensitivity, setScrollingReturnButtonsSensitivity ])}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};