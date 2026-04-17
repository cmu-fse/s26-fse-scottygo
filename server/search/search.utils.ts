import type { INotification } from '../../common/transit.interface';

const STOP_WORDS = new Set([
  'a',
  'able',
  'about',
  'across',
  'after',
  'all',
  'almost',
  'also',
  'am',
  'among',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'dear',
  'did',
  'do',
  'does',
  'either',
  'else',
  'ever',
  'every',
  'for',
  'from',
  'get',
  'got',
  'had',
  'has',
  'have',
  'he',
  'her',
  'hers',
  'him',
  'his',
  'how',
  'however',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'least',
  'let',
  'like',
  'likely',
  'may',
  'me',
  'might',
  'most',
  'must',
  'my',
  'neither',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'often',
  'on',
  'only',
  'or',
  'other',
  'our',
  'own',
  'rather',
  'said',
  'say',
  'says',
  'she',
  'should',
  'since',
  'so',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'tis',
  'to',
  'too',
  'twas',
  'us',
  'wants',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'yet',
  'you',
  'your'
]);

const TOKEN_ALIAS_MAP: Record<string, string> = {
  avenue: 'ave',
  ave: 'ave',
  street: 'st',
  st: 'st',
  drive: 'dr',
  dr: 'dr',
  road: 'rd',
  rd: 'rd',
  boulevard: 'blvd',
  blvd: 'blvd',
  lane: 'ln',
  ln: 'ln',
  place: 'pl',
  pl: 'pl',
  court: 'ct',
  ct: 'ct'
};

/**
 * Removes stop words from a raw query string (R2).
 * Returns the meaningful tokens joined as a string,
 * or null if every token is a stop word (triggers empty-result short-circuit).
 */
export function filterStopWords(query: string): string | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !STOP_WORDS.has(t));
  return meaningful.length > 0 ? meaningful.join(' ') : null;
}

function normalizeToken(rawToken: string): string {
  const cleaned = rawToken.replace(/[^a-z0-9]/g, '');
  if (!cleaned) return '';
  return TOKEN_ALIAS_MAP[cleaned] ?? cleaned;
}

export function toSearchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[+&/]/g, ' and ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

export function matchesAllQueryTokens(
  queryTokens: string[],
  candidateText: string
): boolean {
  if (queryTokens.length === 0) return false;

  const candidateTokens = toSearchTokens(candidateText);
  if (candidateTokens.length === 0) return false;

  const uniqueQueryTokens = [...new Set(queryTokens)];
  return uniqueQueryTokens.every((queryToken) =>
    candidateTokens.some((candidateToken) =>
      candidateToken.includes(queryToken)
    )
  );
}

export function matchesNotificationText(
  notification: INotification,
  lowerQuery: string
): boolean {
  return (
    notification.message.toLowerCase().includes(lowerQuery) ||
    notification.routeId.toLowerCase().includes(lowerQuery) ||
    notification.vid.toLowerCase().includes(lowerQuery)
  );
}
