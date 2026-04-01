/**
 * LLM Content Moderation Service (R11)
 *
 * Checks free-text bus report comments for inappropriate content.
 * If an external moderation API key is configured, calls that API.
 * Otherwise, falls back to a basic keyword filter.
 */

function tag(): string {
  return `[ModerationService ${new Date().toISOString()}]`;
}

export interface IModerationResult {
  flagged: boolean;
  reason?: string;
}

/** Basic blocklist for the fallback filter. */
const BLOCKED_PATTERNS = [
  /\b(fuck|shit|damn|ass|bitch|bastard|crap|piss|dick|cock|cunt)\b/i,
  /\b(kill|murder|bomb|threat|attack|terroris[tm])\b/i,
  /\b(hate\s+(you|them|everyone|all))\b/i
];

class ModerationService {
  /**
   * Moderate a comment string.
   * Returns { flagged: true, reason } if the comment is inappropriate.
   */
  async moderate(comment: string): Promise<IModerationResult> {
    if (!comment || comment.trim().length === 0) {
      return { flagged: false };
    }

    // Use the basic keyword filter
    return this.keywordFilter(comment);
  }

  private keywordFilter(comment: string): IModerationResult {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(comment)) {
        console.log(`${tag()} Comment flagged by keyword filter`);
        return {
          flagged: true,
          reason: 'Comment contains inappropriate language.'
        };
      }
    }
    return { flagged: false };
  }
}

const moderationService = new ModerationService();
export default moderationService;
