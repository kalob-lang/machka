self.onmessage = (e) => {
  const { task, content, segmentationRule, translations, oldTranslations, translationSanitization } = e.data;

  const countWords = (text) => {
    if (typeof text !== 'string') return 0;
    return text.split(/\s+/).filter(word => word !== '').length;
  };

  const rule = segmentationRule || '\n';
  const wrappedRule = `(${rule})`;
  const parts = content.split(new RegExp(wrappedRule));
  const segments = parts.filter((_, i) => i % 2 === 0);
  const delimiters = parts.filter((_, i) => i % 2 !== 0);

  if (task === 'segment') {
    const newSegments = segments.map(s => s.trim()).filter(Boolean);
    const newTranslations = {};
    newSegments.forEach(newSegment => {
      if (oldTranslations[newSegment]) {
        newTranslations[newSegment] = oldTranslations[newSegment];
      }
    });
    self.postMessage({
      task: 'segment',
      newDelimiters: delimiters,
      newTranslations,
    });
  } else { // Default task is 'stats'
    const sourceWordCount = countWords(content);
    const translatedSegments = Object.keys(translations).filter(key => key !== '__title__');

    const translatedWordCount = translatedSegments.reduce((acc, key) => {
      const translationData = translations[key];
      const text = (typeof translationData === 'object' && translationData !== null) ? translationData.text : translationData;
      return acc + countWords(text);
    }, 0);

    const numSegments = segments.filter(seg => seg.trim() !== '').length;
    const avgSourceWords = numSegments > 0 ? (sourceWordCount / numSegments).toFixed(2) : 0;
    const numTranslatedSegments = translatedSegments.length;
    const avgTranslatedWords = numTranslatedSegments > 0 ? (translatedWordCount / numTranslatedSegments).toFixed(2) : 0;

    const generateExport = (format, includeNotes) => {
      let reconstructed = '';
      const notes = [];
      let noteCounter = 1;
      let htmlParagraphBuffer = '';

      const flushHtmlParagraphBuffer = () => {
        if (htmlParagraphBuffer.trim()) {
          const paragraphs = htmlParagraphBuffer.trim().split(/\n{2,}/);
          paragraphs.forEach(p => {
            if (p.trim()) reconstructed += `<p>${p}</p>\n`;
          });
        }
        htmlParagraphBuffer = '';
      };

      const sanitize = (text) => {
        if (!translationSanitization) return text;
        // Add more sanitization rules here
        return text.replace(/!/g, '.');
      };

      segments.forEach((seg, i) => {
        const trimmedSeg = seg.trim();
        if (!trimmedSeg) return;

        const translationData = translations[trimmedSeg];
        const prevTranslationData = i > 0 ? translations[segments[i - 1].trim()] : null;

        let translationText = seg;
        let noteText = '';

        if (translationData) {
          if (translationData.segmentType === 'Skip') {
            translationText = '';
          } else if (typeof translationData === 'object' && translationData !== null) {
            translationText = translationData.text || seg;
            if (includeNotes && translationData.note) {
              if (format === 'txt') noteText = ` [${noteCounter}]`;
              if (format === 'md') noteText = `[^${noteCounter}]`;
              if (format === 'html') noteText = `&nbsp;<a href="#note-${noteCounter}" id="note-ref-${noteCounter}"><sup>${noteCounter}</sup></a>`;
              notes.push({ number: noteCounter, text: translationData.note });
              noteCounter++;
            }
          } else {
            translationText = translationData;
          }
        }

        if (format === 'html' && translationData?.segmentType === 'Heading') {
          flushHtmlParagraphBuffer();
          const level = translationData.outlineLevel?.replace('Level ', '') || '2';
          reconstructed += `<h${level}>${translationText}</h${level}>\n`;
          return; // Skip delimiter and normal processing for headings
        }

        if (format === 'md' && translationData?.segmentType === 'Heading') {
          const level = translationData.outlineLevel?.replace('Level ', '') || '2';
          reconstructed += '#'.repeat(parseInt(level, 10)) + ' ' + translationText + '\n\n';
        } else {
          // Handle preceding delimiter
          if (i > 0 && delimiters[i-1]) {
            const currentDelim = sanitize(delimiters[i-1])
            const prevAction = prevTranslationData?.delimiterAction;
            if (prevAction !== 'Skip Succeeding' && prevAction !== 'Skip Both') {
                const currentAction = translationData?.delimiterAction;
                if (currentAction !== 'Skip Preceding' && currentAction !== 'Skip Both') {
                    if (format === 'html') htmlParagraphBuffer += currentDelim;
                    else reconstructed += currentDelim;
                }
            }
          }
          if (format === 'html') htmlParagraphBuffer += translationText + noteText;
          else reconstructed += translationText + noteText;
        }
      });

      if (format === 'html') flushHtmlParagraphBuffer();

      if (includeNotes && notes.length > 0) {
        if (format === 'txt') {
          reconstructed += '\n\n---\n\nNotes\n\n' + notes.map(n => `${n.number}. ${n.text}`).join('\n');
        } else if (format === 'md') {
          reconstructed += '\n\n---\n\n' + notes.map(n => `[^${n.number}]: ${n.text}`).join('\n');
        } else if (format === 'html') {
          reconstructed += `<hr><h2>Notes</h2><ol>${notes.map(n => `<li id="note-${n.number}">${n.text}</li>`).join('')}</ol>`;
        }
      }

      return reconstructed;
    }

    self.postMessage({
      task: 'stats',
      stats: {
        sourceWordCount,
        translatedWordCount,
        numSegments,
        avgSourceWords,
        numTranslatedSegments,
        avgTranslatedWords,
      },
      renderedContent: {
        txt: generateExport('txt', true),
        md: generateExport('md', true),
        html: generateExport('html', true),
        txt_no_notes: generateExport('txt', false),
        md_no_notes: generateExport('md', false),
        html_no_notes: generateExport('html', false),
      }
    });
  }
};