import React, { useState, useEffect } from 'react';
import { Button, Card, Form, Stack, ProgressBar, Row, Col } from 'react-bootstrap';
import { CompressionLevel, useApp, SourceSelectionLocation } from '../AppContext';

const Settings: React.FC = () => {
  const { 
    theme, setTheme, 
    spellCheck, setSpellCheck, 
    autocomplete, setAutocomplete, 
    wiktionarySearch, setWiktionarySearch, 
    storageVersion, updateStorageVersion,
    defaultCompression, setDefaultCompression,
    defaultCompressionLevel, setDefaultCompressionLevel,
    sourceSelectionLocation, handleSetSourceSelectionLocation,
    showModeHelp, setShowModeHelp,
    translationSanitization, setTranslationSanitization,
    scrollingReturnButtonsEnabled, setScrollingReturnButtonsEnabled,
    scrollingReturnButtonsSensitivity, setScrollingReturnButtonsSensitivity
  } = useApp();
  const [storageUsage, setStorageUsage] = useState({ used: 0, percentage: 0 });

  const calculateLocalStorageSize = () => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) total += new Blob([key, value]).size;
      }
    }
    return total;
  };

  useEffect(() => {
    const used = calculateLocalStorageSize();
    const total = 5 * 1024 * 1024; // 5MB quota
    const percentage = (used / total) * 100;
    setStorageUsage({ used, percentage });
  }, [storageVersion]);

  const handleBackup = () => {
    const data = JSON.stringify(localStorage);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uywng-machka-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          const data = JSON.parse(content);
          // Clear existing data before restoring
          localStorage.clear();
          for (const key in data) {
            localStorage.setItem(key, data[key]);
          }
          alert('Data restored successfully! Reloading page.');
          window.location.reload();
        } catch (error) {
          alert('Error restoring data. Please select a valid backup file.');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset your session? All data will be lost.')) {
      localStorage.clear();
      updateStorageVersion();
      window.location.reload();
    }
  };

  const themes = ['brite', 'cerulean', 'cosmo', 'cyborg', 'darkly', 'flatly', 'journal', 'litera', 'lumen', 'lux', 'materia', 'minty', 'morph', 'pulse', 'quartz', 'sandstone', 'simplex', 'sketchy', 'slate', 'solar', 'spacelab',
'superhero', 'united', 'vapor', 'yeti', 'zephyr'];

  return (
    <div>
      <h1>Settings</h1>

      <Card className="mt-4">
        <Card.Header>Theme</Card.Header>
        <Card.Body>
          <Form.Group controlId="themeSelect">
            <Form.Label>Select a theme:</Form.Label>
            <Form.Control as="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {themes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Form.Control>
          </Form.Group>
        </Card.Body>
      </Card>

      <Card className="mt-4">
        <Card.Header>Session Settings</Card.Header>
        <Card.Body>
          <Form.Check 
            type="switch"
            id="show-mode-help-switch"
            label="Show Help Panels"
            checked={showModeHelp}
            onChange={(e) => setShowModeHelp(e.target.checked)}
          />
          <hr />
          <Form.Group as={Row} className="mb-3">
            <Form.Label column sm="4">
              Source Selection Starting Location
            </Form.Label>
            <Col sm="8">
              <Form.Select 
                value={sourceSelectionLocation} 
                onChange={(e) => handleSetSourceSelectionLocation(e.target.value as SourceSelectionLocation)}
              >
                <option value="source-top">Source - Top</option>
                <option value="source-preview">Source - Preview</option>
                <option value="translation-first">Translation - First Segment</option>
                <option value="translation-incomplete">Translation - First Incomplete Segment</option>
              </Form.Select>
            </Col>
          </Form.Group>
          <hr />
          <Form.Check
            type="switch"
            id="scrolling-return-buttons-switch"
            label="Scrolling Return Buttons"
            checked={scrollingReturnButtonsEnabled}
            onChange={(e) => setScrollingReturnButtonsEnabled(e.target.checked)}
          />
          {scrollingReturnButtonsEnabled && (
            <Form.Group controlId="scrollingReturnButtonsSensitivity" className="mt-3">
              <Form.Label>Display Sensitivity: {scrollingReturnButtonsSensitivity}</Form.Label>
              <Form.Range
                min="1"
                max="10"
                step="1"
                value={scrollingReturnButtonsSensitivity}
                onChange={(e) => setScrollingReturnButtonsSensitivity(parseInt(e.target.value, 10))}
              />
              <Form.Text>
                Changing the sensitivity will determine how far away from either home or the editing segment that you can scroll before you see the buttons.
              </Form.Text>
            </Form.Group>
          )}
          <hr />
          <Form.Check 
            type="switch"
            id="spell-check-switch"
            label="Spell Checking"
            checked={spellCheck}
            onChange={(e) => setSpellCheck(e.target.checked)}
          />
          <Form.Check 
            type="switch"
            id="autocomplete-switch"
            label="Autocomplete"
            checked={autocomplete}
            onChange={(e) => setAutocomplete(e.target.checked)}
          />
          <Form.Group controlId="wiktionarySearchSelect" className="mt-3">
            <Form.Label>Wiktionary Search</Form.Label>
            <Form.Control as="select" value={wiktionarySearch} onChange={(e) => setWiktionarySearch(e.target.value)}>
              <option value="modal">Modal</option>
              <option value="new-tab">New Tab</option>
            </Form.Control>
          </Form.Group>
          <hr />
          <Form.Check
            type="switch"
            id="translation-sanitization-switch"
            label="Translation Output Sanitization"
            checked={translationSanitization}
            onChange={(e) => setTranslationSanitization(e.target.checked)}
          />
          <Form.Text>
            This setting will cause any exclamation points to be rendered as regular periods in the translation output. Turning this off will cause exclamation points to remain as-is in the translation output. At a later time, additional sanitization practices may be added.
          </Form.Text>

          <Form.Check
            type="switch"
            id="default-compression-switch"
            label="Compress new or imported sources on creation"
            checked={defaultCompression}
            onChange={(e) => setDefaultCompression(e.target.checked)}
          />
          <Form.Group controlId="defaultCompressionLevel" className="mt-3" hidden={!defaultCompression}>
            <Form.Label>Default Compression Level: {defaultCompressionLevel}</Form.Label>
            <Form.Range
              min="0" 
              max="9" 
              step="1" 
              value={defaultCompressionLevel} 
              onChange={(e) => setDefaultCompressionLevel(parseInt(e.target.value, 10) as CompressionLevel)} 
            />
          </Form.Group>
        </Card.Body>
      </Card>
      
      <Card className="mt-4">
        <Card.Header>Local Storage</Card.Header>
        <Card.Body>
          <p>Your browser has a local storage quota (usually 5MB). You have used {(storageUsage.used / 1024).toFixed(2)} KB.</p>
          <ProgressBar 
            now={storageUsage.percentage} 
            label={`${storageUsage.percentage.toFixed(2)}%`} 
            variant={storageUsage.percentage > 80 ? 'danger' : storageUsage.percentage > 60 ? 'warning' : 'success'}
          />
          <hr />
          <p>Backup your current session to a file, or restore from a previous backup.</p>
          <Stack direction='horizontal' gap={1} className="mt-3">
            <Button variant="primary" onClick={handleBackup}>Backup Data</Button>
            <label htmlFor="restore-input" className="btn btn-secondary ml-2">Restore Data</label>
            <input id="restore-input" type="file" accept=".json" onChange={handleRestore} style={{ display: 'none' }} />
          </Stack>
        </Card.Body>
      </Card>

      <Card className="mt-4">
        <Card.Header>Danger Zone</Card.Header>
        <Card.Body>
          <p>Reset the application to a blank slate. This will clear all sources, translations, and memories.</p>
          <Button variant="danger" onClick={handleReset}>Reset Session</Button>
        </Card.Body>
      </Card>
    </div>
  );
}

export default Settings;