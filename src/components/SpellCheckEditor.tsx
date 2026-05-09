import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { linter, Diagnostic, forEachDiagnostic } from '@codemirror/lint';
import { minimalSetup } from 'codemirror';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import Fuse from 'fuse.js';
import { useApp } from '../AppContext';
import { lexiconData, commonSuffixes } from '../vendor/kalobLexicon';

interface KalobLexiconResult {
  word: string,
  eng: string,
  cat: string,
  pos: string
}

interface SpellCheckEditorProps {
  value: string;
  onChange: (value: string) => void;
  onDiagnosticsChange: (diagnostics: readonly Diagnostic[]) => void;
  autofocus?: boolean;
  numberedMemories: Record<number, { source: string, target: string }>;
  isDirty?: boolean;
}

const nounRootsArray = lexiconData.filter(w => w.cat === 'Noun/Number').map(w => w.word.toLowerCase()).sort((a,b) => b.length - a.length);
const allRoots = new Set(lexiconData.map(w => w.word.toLowerCase()));
const suffixesArray = commonSuffixes.map(s => s.suffix.toLowerCase()).sort((a,b) => b.length - a.length);

const nounPattern = `(?:${nounRootsArray.join('|')})`;
const suffixPattern = `(?:${suffixesArray.join('|')})`;
const compoundRegex = new RegExp(`^u?${nounPattern}(?:u${nounPattern})?(?:${suffixPattern}){0,3}u?[ieoavw]?$`);

function checkSpelling(word: string): boolean {
    const lowerWord = word.toLowerCase();
    if (allRoots.has(lowerWord)) return true;
    if (compoundRegex.test(lowerWord)) return true;
    return false;
}

const SpellCheckEditor: React.FC<SpellCheckEditorProps> = ({ value, onChange, onDiagnosticsChange, autofocus, numberedMemories, isDirty }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const numberedMemoriesRef = useRef(numberedMemories);
  const { spellCheck, autocomplete } = useApp();

  useEffect(() => {
    numberedMemoriesRef.current = numberedMemories;
  }, [numberedMemories]);

  useEffect(() => {
    let isCancelled = false;

    const fuse = new Fuse(lexiconData, { keys: ['word', 'eng'], includeScore: true, threshold: 0.1 });

    const customAutocomplete = (context: CompletionContext, fuse: Fuse<KalobLexiconResult>) => {
        const memoryTag = context.matchBefore(/!\d*/);
        if (memoryTag) {
          if (memoryTag.text === '!') {
            return {
              from: memoryTag.from,
              options: Object.entries(numberedMemoriesRef.current).map(([num, mem]) => ({
                label: `!${num}`,
                type: 'Memory',
                detail: mem.target,
                apply: mem.target,
                info: mem.source,
              }))
            }
          }
          const num = parseInt(memoryTag.text.substring(1), 10);
          const memory = numberedMemoriesRef.current[num];
          if (memory) {
            return {
              from: memoryTag.from,
              options: [{
                label: `!${num}`,
                type: 'Memory',
                detail: memory.target,
                info: memory.source,
              }]
            }
          }
        }

        const word = context.matchBefore(/[A-Za-z']*/);
        if (!word || (word.from === word.to && !context.explicit)) {
          return null;
        }
        const results = fuse.search(word.text);

        return {
          from: word.from,
          options: results.map(r => {
            const infoElem = document.createElement('div')
            infoElem.innerHTML = 
              `<strong>Type:</strong> ${r.item.cat}
               <strong>POS:</strong> ${r.item.pos}`
            return { label: r.item.word, type: r.item.cat, detail: r.item.eng, info: () => infoElem}
          }),
        };
    };

    const spellLinter = linter((view) => {
      if (!spellCheck) return [];
      const diagnostics: Diagnostic[] = [];
      try {
        const text = view.state.doc.toString();
        const lookbehind = '(?<=^|[\\s\\-"\'“«<¿])'
        const lookahead = '(?=[\\s\\.,;:\\-"\'”»>?]|$)'
        const words = text.match(new RegExp(`${lookbehind}\\p{Letter}+${lookahead}`, 'gv')) || [];
        for (const w of words) if (!/^[A-Z]/.test(w) && !checkSpelling(w)) for (const m of text.matchAll(new RegExp(`${lookbehind}${w}${lookahead}`, 'gv')))
          diagnostics.push({
            from: m.index!,
            to: m.index! + w.length,
            severity: 'warning',
            message: `Unrecognized Kalob word or invalid compound`,
        });
      } catch (e) { console.error(e) }
      return diagnostics;
    });

    const extensions = [
      minimalSetup,
      spellLinter,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
        const diagnostics: Diagnostic[] = []
        forEachDiagnostic(update.state, d => diagnostics.push(d))
        onDiagnosticsChange(diagnostics);
      }),
    ];

    if (autocomplete) {
      extensions.push(autocompletion({ override: [(ctx) => customAutocomplete(ctx, fuse as unknown as Fuse<KalobLexiconResult>)] }));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current!,
    });

    viewRef.current = view;

    if (autofocus) {
      view.focus();
    }

    return () => {
      isCancelled = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [autofocus, onChange, onDiagnosticsChange, spellCheck, autocomplete]);

  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
        viewRef.current.dispatch({
            changes: { from: 0, to: viewRef.current.state.doc.length, insert: value }
        });
    }
  }, [value]);

  return <div ref={editorRef} className={isDirty ? 'dirty-outline' : ''} style={{paddingTop: '0.5em', paddingBottom: '0.5em'}}/>;
};

export default SpellCheckEditor;
