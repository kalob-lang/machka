export interface WritingSystem {
  name: string;
  fonts: string[];
  transliterate: (text: string) => string;
}

const cypherMap: Record<string, string> = {
    'p': 'e', 'b': 'ɘ',
    't': 'ʌ', 'd': 'v',
    'k': 'c', 'g': 'ↄ',
    'q': 'ʊ',
    's': 's', 'z': 'ƨ',
    'c': 'ɛ', 'j': 'ɜ',
    'ph': 'e̱', 'bh': 'ɘ̱',
    'th': 'ʌ̱', 'dh': 'v̱',
    'kh': 'c̱', 'gh': 'ↄ̱',
    'qh': 'ʊ̱',
    'sh': 's̱', 'zh': 'ƨ̱',
    'ch': 'ɛ̱', 'jh': 'ɜ̱',
    'm': 'ƞ', 'n': 'ʜ',
    'l': 'ꞁ',
    'r': 'ɽ',
    'y': 'ɥ',
    'x': 'ı' 
};

const vowelDiac: Record<string, string> = {
    'a': '\u0300', // Grave `
    'e': '\u0301', // Acute ´
    'i': '\u0302', // Circumflex ˆ
    'o': '\u0307', // Dot ̇
    'u': '\u0308', // Diaeresis ¨
    'v': '\u030C', // Caron ˇ
    'w': '\u0303'  // Tilde ˜
};

const preProc: Record<string, string> = {
    'ph':'0', 'th':'1', 'kh':'2', 'qh':'3', 'sh':'4', 'ch':'5',
    'bh':'6', 'dh':'7', 'gh':'8', 'zh':'9', 'jh':'@'
};

const postProc: Record<string, string> = {
    '0':'ph', '1':'th', '2':'kh', '3':'qh', '4':'sh', '5':'ch',
    '6':'bh', '7':'dh', '8':'gh', '9':'zh', '@':'jh'
};

function convertChunk(chunk: string, isPure: boolean, useToolU: boolean): string {
    let s = chunk; 
    for(let k in preProc) s = s.replace(new RegExp(k, 'g'), preProc[k]);

    let out = '';
    let lastWasConsonant = false;

    // Sequential parser
    for (let i = 0; i < s.length; i++) {
        let char = s[i];

        if (vowelDiac[char]) {
            // It's a vowel. Check if it needs an onset anchor.
            if (!lastWasConsonant) {
                out += cypherMap['x']; 
            }
            // Append the diacritic if in "Pure" mode
            if (isPure) {
                out += vowelDiac[char];
            }
            // A vowel terminates the active consonant state
            lastWasConsonant = false; 
        } else {
            // It's a consonant or punctuation
            let cLat = postProc[char] || char;
            
            if (cypherMap[cLat]) {
                out += cypherMap[cLat];
                lastWasConsonant = true;
            } else {
                out += char;
                lastWasConsonant = false;
            }
        }
    }

    // Apply the Tool U Shortcut (ı + ¨)
    if (useToolU && isPure) {
        out = out.replace(/ı\u0308/g, ':');
    }

    return out;
}

function convertToCypher(text: string, isPure: boolean, useToolU: boolean): string {
    return text.replace(/[a-zA-Z\-]+/g, (word) => {
        let chunks = word.split('-'); 
        let out = '';
        for (let chunk of chunks) out += convertChunk(chunk, isPure, useToolU);
        return out;
    });
}

export const Abjhad: WritingSystem = {
    name: "Abjhad",
    fonts: [
        "System Default",
        "Andika Bold",
        "Andika Medium",
        "Andika Regular",
        "Andika SemiBold",
        "Charis Bold",
        "Charis Medium",
        "Charis Regular",
        "Charis SemiBold",
        "Doulos SIL Regular",
        "GalSIL Bold",
        "GalSIL Regular",
        "Gentium Bold",
        "Gentium ExtraBold",
        "Gentium Medium",
        "Gentium SemiBold",
        "Noto Sans Black",
        "Noto Sans Bold",
        "Noto Sans Condensed Black",
        "Noto Sans Condensed Bold",
        "Noto Sans Condensed ExtraBold",
        "Noto Sans Condensed ExtraLight",
        "Noto Sans Condensed Light",
        "Noto Sans Condensed Medium",
        "Noto Sans Condensed Regular",
        "Noto Sans Condensed SemiBold"
    ],
    transliterate: (text: string) => {
        let quotation = ['« ', ' »'];
        let pureAbjad = true;
        let doToolUShortcut = true;
        let doTransliterate = true;
        
        let processed = text
            .split('"')
            .reduce((acc, v, i) => acc + (i % 2 ? '[' : ']') + v)
            .replace(/\b[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\b/g, '{$&}'); 
    
        let parts = processed.split(/(\{.*?\})/);
        
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].startsWith('{')) {
                let noun = parts[i].slice(1, -1).toLowerCase(); 
                if (doTransliterate) {
                    parts[i] = '⟨ ' + convertToCypher(noun, pureAbjad, doToolUShortcut) + ' ⟩';
                } else {
                    parts[i] = '⟨ ' + noun + ' ⟩';
                }
            } else {
                parts[i] = convertToCypher(parts[i].toLowerCase(), pureAbjad, doToolUShortcut);
            }
        }
    
        let final = parts.join('')
            .replace(/\[/g, quotation[0])
            .replace(/]/g, quotation[1]);
    
        return final;
    }
};
