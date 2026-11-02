import type { SearchDocument } from "./tavily.js";

// Groq's free tier has a much smaller per-minute token allowance than its
// context window. Keep a bounded selection of literal passages, not summaries
// invented by another model. The full documents remain available to the server
// validator, including official-site evidence omitted from this prompt.
export const GROQ_DOCUMENT_BYTES = 12_000;
const omission = "\n[... trecho omitido ...]\n";

function utf8Prefix(text: string, bytes: number) {
  let result = "";
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (size > bytes) break;
    result += character;
    bytes -= size;
  }
  return result;
}

function passages(content: string, budget: number) {
  if (Buffer.byteLength(content) <= budget) return content;
  const ranges: [number, number][] = [
    [0, Math.min(content.length, 650)],
    [Math.max(0, content.length - 650), content.length],
  ];
  // Sites and contacts can be in the middle of a long directory page. Retain
  // their original surrounding text and mark every omitted gap explicitly.
  const markers = content.matchAll(
    /https?:\/\/|www\.|\b(?:site|website|telefone|contato|endere[çc]o|rua|avenida|email|e-mail)\b|\(\d{2}\)|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
  );
  for (const match of markers) {
    if (ranges.length >= 8) break;
    const start = Math.max(0, match.index - 220);
    const end = Math.min(content.length, match.index + 430);
    if (!ranges.some(([a, b]) => start >= a && end <= b))
      ranges.push([start, end]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  // Distribute the budget so a verbose header cannot crowd out the footer.
  const gapBytes = Buffer.byteLength(omission) * (merged.length - 1);
  const share = Math.max(0, Math.floor((budget - gapBytes) / merged.length));
  return merged
    .map(([start, end]) =>
      end === content.length
        ? [
            ...utf8Prefix(
              [...content.slice(start, end)].reverse().join(""),
              share,
            ),
          ]
            .reverse()
            .join("")
        : utf8Prefix(content.slice(start, end), share),
    )
    .join(omission);
}

export function groqResearchDocuments(documents: SearchDocument[]) {
  const selected = documents.slice(0, 6).map((document) => ({
    ...document,
    content: "",
  }));
  // Metadata also consumes quota. Never change a URL or invent a source ID to
  // make a document fit; drop the last source instead if necessary.
  while (
    selected.length &&
    Buffer.byteLength(JSON.stringify(selected)) > GROQ_DOCUMENT_BYTES / 2
  )
    selected.pop();
  const available =
    GROQ_DOCUMENT_BYTES - Buffer.byteLength(JSON.stringify(selected));
  const share = Math.floor(available / Math.max(1, selected.length));
  for (const document of selected) {
    const original = documents.find((item) => item.id === document.id)!;
    document.content = passages(original.content, Math.max(0, share - 128));
  }
  // JSON escaping may expand control characters beyond the passage byte count.
  // Reduce only text; preserve identity and source metadata unchanged.
  while (Buffer.byteLength(JSON.stringify(selected)) > GROQ_DOCUMENT_BYTES) {
    const longest = selected.reduce((a, b) =>
      a.content.length >= b.content.length ? a : b,
    );
    longest.content = utf8Prefix(
      longest.content,
      Math.max(0, Buffer.byteLength(longest.content) - 256),
    );
  }
  return selected;
}
