/**
 * Recovers JSON text without coupling the transport layer to a domain schema.
 * Callers own schema validation through the parse callback.
 */
export function parseStructuredJsonText<T>(
    text: string,
    parse: (value: unknown) => T | undefined,
): T | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const candidates = [trimmed];
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
        candidates.push(fenced[1].trim());
    }

    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
    }

    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        candidates.push(trimmed.slice(objectStart, objectEnd + 1));
    }

    for (const candidate of candidates) {
        try {
            const output = parse(JSON.parse(candidate));
            if (output !== undefined) return output;
        } catch {
            // Try the next common JSON wrapping style.
        }
    }

    return undefined;
}
