export function escapeXmlAttribute(value: string): string {
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
    } as const;

    type EscapeMapKey = keyof typeof escapeMap;

    return value.replace(/[&<>"']/gu, (char) => escapeMap[char as EscapeMapKey]);
}

export function tag(name: string, attrs: Record<string, string> = {}, close = true, content?: string): string {
    const end = close && !content ? '/>' : '>';
    const pairs: string[] = [];

    for (const key in attrs) {
        if (Object.hasOwn(attrs, key)) {
            const k = escapeXmlAttribute(key);
            const v = escapeXmlAttribute(attrs[key]!);
            pairs.push(`${k}="${v}"`);
        }
    }

    const attrsStr = pairs.length ? ` ${pairs.join(' ')}` : '';
    let tag = `<${name}${attrsStr}${end}`;
    if (content) {
        tag += `${content}</${name}${end}`;
    }

    return tag;
}
