import React from 'react';
import { Alert } from 'react-bootstrap';
import { useApp } from '../AppContext';

interface ModeHelpAlertProps {
  mode: 'translation' | 'source' | 'memory';
  className?: string;
}

const helpTexts: Record<ModeHelpAlertProps['mode'], React.ReactNode> = {
  translation: (
    <ul>
      <li>Click the pencil icon ✏️ to begin translating a segment.</li>
      <li>Underlined words have saved 'memories'; click them to insert the translation.</li>
      <li>Select text in a source segment to search Wiktionary or create a new memory.</li>
      <li>Use the <b>Note</b> and <b>Bookmark</b> buttons to add information to a segment. Click 🔃 to flip the popover position.</li>
      <li>The gear icon ⚙️ holds advanced options like changing the segment type (e.g., to 'Heading' or 'Skip') or splitting the source.</li>
      <li>Use the navigation bar at the top right to jump to bookmarks or specific segments.</li>
    </ul>
  ),
  source: (
    <ul>
      <li>Manage your document's core properties here: its filename, title, and full text content.</li>
      <li>The <b>Segmentation</b> section controls how content is split into segments for translation using a regular expression.</li>
      <li>Use the <b>Preview</b> button to see how a new segmentation rule will affect the document before applying it.</li>
      <li>Enable <b>Compression</b> to save storage space, which is useful for very large sources.</li>
      <li>Once translated, you can <b>Export</b> your work to TXT, MD, or HTML formats.</li>
      <li>Use <b>Save MACHKA file as...</b> to back up the entire project (source, translations, and memories) to a single file.</li>
    </ul>
  ),
  memory: (
    <ul>
      <li>This editor shows all memories that are used in at least one segment of the current source.</li>
      <li>Memories are reusable translations that automatically appear as suggestions in the Translation Editor.</li>
      <li>You can edit (✏️), delete (🗑️), or add an alternative spelling (↔️) to a memory.</li>
      <li>Use the <b>Import Memories</b> panel to reuse memories from other sources in your project.</li>
      <li><b>Important:</b> For best results, ensure your memory's source text is a whole word or phrase with clear word boundaries. Partially matching memories are marked with a ⚠️ and have limited functionality.</li>
    </ul>
  ),
};

const ModeHelpAlert: React.FC<ModeHelpAlertProps> = ({ mode, className }) => {
  const { showModeHelp } = useApp();

  if (!showModeHelp) {
    return null;
  }

  return (
    <Alert variant="light" className={`mode-help-alert ${className || ''}`}>
      {helpTexts[mode]}
    </Alert>
  );
};

export default ModeHelpAlert;
