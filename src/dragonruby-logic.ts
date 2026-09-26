export type DragonRubyProjectConfidence = 'confirmed' | 'uncertain' | 'rejected';

export function fileContainsDragonRubySignals(contents: string): boolean {
  const text = contents.replace(/\r/g, '');
  return /def\s+tick\s+args\b|args\.outputs\b|args\.inputs\b|args\.state\b|\$gtk\b|def\s+[A-Za-z_][A-Za-z0-9_]*\s+args\b/.test(text) ||
    /controller_(one|two|three|four)\b/.test(text) ||
    /metadata\s*\.|sprites\s*\.|sounds\s*\.|fonts\s*\./.test(text);
}

export function hasDragonRubyProjectMarkers(directoryNames: Iterable<string>): boolean {
  const names = new Set(Array.from(directoryNames).map((name) => name.toLowerCase()));
  return ['app', 'mygame', 'metadata', 'sprites', 'sounds', 'fonts', 'data'].some((marker) => names.has(marker));
}

export function computeConfidenceFromSignals(contents: string | undefined, directoryNames: Iterable<string> = []): DragonRubyProjectConfidence {
  if (contents && fileContainsDragonRubySignals(contents)) {
    return 'confirmed';
  }

  if (hasDragonRubyProjectMarkers(directoryNames)) {
    return 'uncertain';
  }

  return 'rejected';
}
