export function segmentText(content: string, rule: string, cancelTriggers: string[]): { segments: string[], delimiters: string[] } {
  const wrappedRule = `(${rule})`;
  const regex = new RegExp(wrappedRule, 'g');
  const parts = content.split(regex);
  
  const triggers = cancelTriggers?.filter(t => t.trim() !== '') || [];
  
  if (triggers.length === 0) {
    return {
      segments: parts.filter((_, i) => i % 2 === 0),
      delimiters: parts.filter((_, i) => i % 2 !== 0)
    };
  }

  const blockedRanges: {start: number, end: number}[] = [];
  for (const trigger of triggers) {
    let pos = 0;
    while (true) {
      const idx = content.indexOf(trigger, pos);
      if (idx === -1) break;
      blockedRanges.push({ start: idx, end: idx + trigger.length });
      pos = idx + 1;
    }
  }

  const segments: string[] = [];
  const delimiters: string[] = [];
  let currentSegment = parts[0] || '';
  let originalIndex = (parts[0] || '').length;

  for (let i = 1; i < parts.length; i += 2) {
    const delimiter = parts[i];
    const nextSegment = parts[i + 1] || '';
    
    const d_start = originalIndex;
    const d_end = d_start + (delimiter?.length || 0);

    const textSoFar = currentSegment + delimiter;
    const trimmedSoFar = textSoFar.trimEnd();
    const segmentTrimmed = currentSegment.trimEnd();
    
    let isCancelled = false;
    for (const trigger of triggers) {
      if (trimmedSoFar.endsWith(trigger) || segmentTrimmed.endsWith(trigger)) {
        isCancelled = true;
        break;
      }
    }
    
    if (!isCancelled) {
      for (const range of blockedRanges) {
        if (range.start < d_end && range.end > d_start) {
          isCancelled = true;
          break;
        }
      }
    }

    if (isCancelled) {
      currentSegment = textSoFar + nextSegment;
    } else {
      segments.push(currentSegment);
      delimiters.push(delimiter);
      currentSegment = nextSegment;
    }

    originalIndex = d_end + (nextSegment?.length || 0);
  }
  segments.push(currentSegment);

  return { segments, delimiters };
}
