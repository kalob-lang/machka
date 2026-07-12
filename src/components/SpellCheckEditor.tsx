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
const strictNounRootsArray = lexiconData.filter(w => w.cat === 'Noun/Number' && w.pos !== 'Numeral').map(w => w.word.toLowerCase()).sort((a,b) => b.length - a.length);
const allRoots = new Set(lexiconData.map(w => w.word.toLowerCase()));
const suffixesArray = commonSuffixes.map(s => s.suffix.toLowerCase()).sort((a,b) => b.length - a.length);

const nonZeroDigit = 'phwn|tvbh|threz|qad|phabh|sigz|sebd|khogd|nobh';
const digit = `ling|${nonZeroDigit}`;
const teens = `ce(?:${nonZeroDigit})`;
const tenBase = `cen|${teens}|(?:${nonZeroDigit}|${teens})en`;
const hundredsDigit = `tvbh|threz|qad|phabh|sigz|sebd|khogd|nobh|${teens}`;
const hundredBase = `khwnd|(?:${hundredsDigit})wnd`;

const multiplier = `(?:${hundredBase}|${tenBase}|${digit})`;
const myoBlock = `(?:${multiplier})?myo(?:n|${multiplier})`;
const numberEntity = `(?:${myoBlock}|${multiplier})`;

const numberSuffixPattern = `(?:am|idh|oz|om|erl|old|in|ag|od)`;
const nounPattern = `(?:${strictNounRootsArray.join('|')})`;
const suffixPattern = `(?:${suffixesArray.join('|')})`;

const modifier = `(?:${nounPattern}|${numberEntity})`;
const headNoun = `${nounPattern}(?:${suffixPattern}){0,3}`;
const headNumber = `${numberEntity}(?:${numberSuffixPattern}){0,3}`;
const coreCompound = `(?:(?:${modifier}u)?(?:${headNoun}|${headNumber}))`;

const compoundRegex = new RegExp(`^[aeiouvw]?${coreCompound}u?[eioavw]?(?:zh|j)?$`);

const numRegex = new RegExp(`^${numberEntity}`);
const nounRegex = new RegExp(`^${nounPattern}`);
const baseTeenRegex = new RegExp(`^(?:${nonZeroDigit}|${teens})$`);

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

    const nonZeroDigits = [
        {word: 'phwn', num: 1}, {word: 'tvbh', num: 2}, {word: 'threz', num: 3},
        {word: 'qad', num: 4}, {word: 'phabh', num: 5}, {word: 'sigz', num: 6},
        {word: 'sebd', num: 7}, {word: 'khogd', num: 8}, {word: 'nobh', num: 9}
    ];
    const generatedNumbers: KalobLexiconResult[] = [];
    nonZeroDigits.forEach(d => {
        generatedNumbers.push({ word: `ce${d.word}`, eng: `${d.num + 10} / ${d.num + 10}`, cat: 'Noun/Number', pos: 'Numeral' });
        
        generatedNumbers.push({ word: `${d.word}en`, eng: `${d.num * 10} / ${d.num * 10}`, cat: 'Noun/Number', pos: 'Numeral' });
        generatedNumbers.push({ word: `ce${d.word}en`, eng: `${(d.num + 10) * 10} / ${(d.num + 10) * 10}`, cat: 'Noun/Number', pos: 'Numeral' });
        
        if (d.num > 1) {
            generatedNumbers.push({ word: `${d.word}wnd`, eng: `${d.num * 100} / ${d.num * 100}`, cat: 'Noun/Number', pos: 'Numeral' });
        }
        generatedNumbers.push({ word: `ce${d.word}wnd`, eng: `${(d.num + 10) * 100} / ${(d.num + 10) * 100}`, cat: 'Noun/Number', pos: 'Numeral' });
        
        generatedNumbers.push({ word: `${d.word}myon`, eng: `${d.num * 1000} / ${d.num * 1000}`, cat: 'Noun/Number', pos: 'Numeral' });
        generatedNumbers.push({ word: `ce${d.word}myon`, eng: `${(d.num + 10) * 1000} / ${(d.num + 10) * 1000}`, cat: 'Noun/Number', pos: 'Numeral' });
    });

    const unifiedLexicon = [
      ...lexiconData,
      ...generatedNumbers,
      ...commonSuffixes.map(s => ({
        word: s.suffix,
        eng: s.desc,
        cat: 'Suffix',
        pos: s.name
      })),
      ...[
        { suffix: 'i', name: 'Eternal present', desc: 'Creates a verb in the eternal present tense.' },
        { suffix: 'o', name: 'Transitory present', desc: 'Creates a verb in the transitory present tense.' },
        { suffix: 'v', name: 'Habitual present', desc: 'Creates a verb in the habitual present tense.' },
        { suffix: 'e', name: 'Past', desc: 'Creates a verb in the past tense.' },
        { suffix: 'w', name: 'Conditional', desc: 'Creates a verb in the conditional tense.' },
        { suffix: 'a', name: 'Future', desc: 'Creates a verb in the future tense.' },
        { suffix: 'ij', name: 'Present Participle (Eternal)', desc: 'Creates a participle with the idea of eternal or general action.' },
        { suffix: 'vj', name: 'Present Participle (Habitual)', desc: 'Creates a participle with the idea of habitual action.' },
        { suffix: 'oj', name: 'Present Participle (Transitory)', desc: 'Creates a participle with the idea of transitory action.' },
        { suffix: 'ej', name: 'Qualifying Adjective (General)', desc: 'Creates a qualifying adjective with the idea of general or eternal quality.' },
        { suffix: 'aj', name: 'Qualifying Adjective (Duty)', desc: 'Creates a qualifying adjective with the idea of duty or obligation.' },
        { suffix: 'wj', name: 'Qualifying Adjective (Possibility)', desc: 'Creates a qualifying adjective with the idea of possibility or potential' },
        { suffix: 'izh', name: 'Gerundive Participle (Eternal)', desc: 'Creates a gerundive with the idea of eternal or general action' },
        { suffix: 'vzh', name: 'Gerundive Participle (Habitual)', desc: 'Creates a gerundive with the idea of habitual action' },
        { suffix: 'ozh', name: 'Gerundive Participle (Transitory)', desc: 'Creates a gerundive with the idea of transitory action' },
        { suffix: 'ezh', name: 'Qualifying Adverb (General)', desc: 'Creates a qualifying adverb with the idea of general or eternal quality' },
        { suffix: 'azh', name: 'Qualifying Adverb (Duty)', desc: 'Creates a qualifying adverb with the idea of duty or obligation' },
        { suffix: 'wzh', name: 'Qualifying Adverb (Possibility)', desc: 'Creates a qualifying adverb with the idea of possibility or potential' }
      ].map(s => ({
        word: s.suffix,
        eng: s.desc,
        cat: 'Primary Ending',
        pos: s.name
      })),
      ...[
        { suffix: 'am', name: 'Collective', desc: 'Unit, Pair, Dozen' },
        { suffix: 'idh', name: 'Ordinal', desc: 'First, Second, Third' },
        { suffix: 'oz', name: 'Multiplier', desc: 'Single, Double, Triple' },
        { suffix: 'om', name: 'Division', desc: 'Quarter' },
        { suffix: 'erl', name: 'Distinctive Collective', desc: 'of three kinds' },
        { suffix: 'old', name: 'Multiplicative', desc: 'Once, Twice, Thrice' },
        { suffix: 'in', name: 'Inhabitant', desc: 'Russian' },
        { suffix: 'ag', name: 'Spouse', desc: "Baker's spouse" },
        { suffix: 'od', name: 'Periodic table element', desc: '"eightium" (oxygen)' }
      ].map(s => ({
        word: s.suffix,
        eng: s.desc,
        cat: 'Number Suffix',
        pos: s.name
      })),
      ...[
        { suffix: 'en', name: 'Tens', desc: 'Forms tens' },
        { suffix: 'wnd', name: 'Hundreds', desc: 'Forms hundreds' }
      ].map(s => ({
        word: s.suffix,
        eng: s.desc,
        cat: 'Base Number Suffix',
        pos: s.name
      })),
      ...[
        { suffix: 'u', name: 'Plural/Compound', desc: 'Plurality and compounding' }
      ].map(s => ({
        word: s.suffix,
        eng: s.desc,
        cat: 'Shared Suffix',
        pos: s.name
      }))
    ];

    const fuse = new Fuse(unifiedLexicon, { keys: ['word', 'eng'], includeScore: true, threshold: 0.1 });

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

        let searchTerm = word.text;
        let fromPos = word.from;
        let categoryFilter: string[] | null = null;

        let textToParse = word.text;
        let parsedLength = 0;

        if (textToParse.startsWith('u')) {
            parsedLength += 1;
        }

        const getBestRoot = (text: string) => {
            const numMatch = text.match(numRegex);
            const nounMatch = text.match(nounRegex);
            let root = '';
            let isNumber = false;
            let isBaseTeen = false;
            if (numMatch && nounMatch) {
                if (numMatch[0].length >= nounMatch[0].length) {
                    root = numMatch[0];
                    isNumber = true;
                } else {
                    root = nounMatch[0];
                    isNumber = false;
                }
            } else if (numMatch) {
                root = numMatch[0];
                isNumber = true;
            } else if (nounMatch) {
                root = nounMatch[0];
                isNumber = false;
            }
            if (isNumber) isBaseTeen = baseTeenRegex.test(root);
            return { root, isNumber, isBaseTeen };
        };

        const r1 = getBestRoot(textToParse.substring(parsedLength));

        if (r1.root) {
            parsedLength += r1.root.length;
            if (parsedLength < textToParse.length) {
                if (textToParse[parsedLength] === 'u') {
                    parsedLength += 1;
                    const r2 = getBestRoot(textToParse.substring(parsedLength));
                    
                    if (r2.root) {
                        let afterRoot2Length = parsedLength + r2.root.length;
                        if (afterRoot2Length < textToParse.length) {
                            categoryFilter = r2.isNumber ? ['Number Suffix', 'Shared Suffix', 'Primary Ending'] : ['Suffix', 'Shared Suffix', 'Primary Ending'];
                            if (r2.isBaseTeen) categoryFilter.push('Base Number Suffix');
                            searchTerm = textToParse.substring(afterRoot2Length);
                            fromPos = word.from + afterRoot2Length;
                        } else {
                            categoryFilter = ['Noun/Number'];
                            searchTerm = textToParse.substring(parsedLength);
                            fromPos = word.from + parsedLength;
                        }
                    } else {
                        categoryFilter = ['Noun/Number'];
                        searchTerm = textToParse.substring(parsedLength);
                        fromPos = word.from + parsedLength;
                    }
                } else {
                    categoryFilter = r1.isNumber ? ['Number Suffix', 'Shared Suffix', 'Primary Ending'] : ['Suffix', 'Shared Suffix', 'Primary Ending'];
                    if (r1.isBaseTeen) categoryFilter.push('Base Number Suffix');
                    searchTerm = textToParse.substring(parsedLength);
                    fromPos = word.from + parsedLength;
                }
            }
        }

        let results = fuse.search(searchTerm);
        if (categoryFilter) {
            results = results.filter(r => categoryFilter!.includes(r.item.cat));
        }

        return {
          from: fromPos,
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
