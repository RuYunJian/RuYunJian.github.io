// Keep whole poems in the loop, with breathing room between clauses and poems.
export function layoutTextFlow(text, spacing, span = 19.5) {
    const source = typeof text === 'string' && text.trim() ? text : '南风知我意';
    const poems = source.split(/[\r\n/／]+/u).map(poem => poem
        .replace(/\p{P}+/gu, '　　')
        .replace(/[\s\u3000]+/gu, '　　')
        .trim()).filter(Boolean);
    const glyphs = [];
    let cursor = 0;
    for (const [index, poem] of poems.entries()) {
        if (index) cursor += spacing * 9;
        for (const character of Array.from(poem)) {
            if (/\s/u.test(character)) cursor += spacing * 1.8;
            else {
                glyphs.push({ character, offset: cursor });
                cursor += spacing;
            }
        }
    }
    return { glyphs, length: Math.max(cursor + spacing * 9, span + spacing * 9) };
}
