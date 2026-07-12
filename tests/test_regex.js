const nonZeroDigit = 'phwn|tvbh|threz|qad|phabh|sigz|sebd|khogd|nobh';
const digit = `ling|${nonZeroDigit}`;
const tenBase = `cen|ce(?:${nonZeroDigit})|(?:${nonZeroDigit})en`;
const hundredsDigit = 'tvbh|threz|qad|phabh|sigz|sebd|khogd|nobh';
const hundredBase = `khwnd|(?:${hundredsDigit})wnd`;

const multiplier = `(?:${hundredBase}|${tenBase}|${digit})`;
const myoBlock = `(?:${multiplier})?myo(?:n|${multiplier})`;
const numberEntity = `(?:${myoBlock}|${multiplier})`;

const numberSuffixPattern = `(?:am|idh|oz|om|erl|old|in|ag|od)`;
// dummy for testing
const nounPattern = `(?:dog|cat)`;
const suffixPattern = `(?:s|ing)`;

const modifier = `(?:${nounPattern}|${numberEntity})`;
const headNoun = `${nounPattern}(?:${suffixPattern}){0,3}`;
const headNumber = `(?:${numberEntity})(?:${numberSuffixPattern}){0,3}`;
const coreCompound = `(?:(?:${modifier}u)?(?:${headNoun}|${headNumber}))`;

const compoundRegex = new RegExp(`^[aeiouvw]?${coreCompound}u?[eioavw]?(?:zh|j)?$`);

console.log("cephwn: ", compoundRegex.test('cephwn'));
console.log("tvbhen: ", compoundRegex.test('tvbhen'));
console.log("threzwnd: ", compoundRegex.test('threzwnd'));
