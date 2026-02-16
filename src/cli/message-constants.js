/**
 * Message Constants - Reusable message definitions
 *
 * Centralized message strings to prevent duplication and ensure consistency.
 * Use these constants instead of hardcoded strings throughout the codebase.
 */

/**
 * Common error messages
 */
export const MESSAGES = {
  /**
   * Project not initialized error
   */
  PROJECT_NOT_INITIALIZED: {
    error: 'Project not initialized',
    help: 'Please run /init first to create the project structure.'
  },

  /**
   * Ceremony headers with titles and documentation URLs
   */
  CEREMONY_HEADERS: {
    'sponsor-call': {
      title: 'Sponsor Call Ceremony',
      url: 'https://agilevibecoding.org/ceremonies/sponsor-call'
    },
    'sprint-planning': {
      title: 'Sprint Planning Ceremony',
      url: 'https://agilevibecoding.org/ceremonies/sprint-planning'
    },
    'seed': {
      title: 'Seed Ceremony',
      url: 'https://agilevibecoding.org/ceremonies/seed'
    }
  }
};

/**
 * Helper function to get full "project not initialized" error message
 * @returns {string} Complete error message with help text
 */
export function getProjectNotInitializedMessage() {
  return `${MESSAGES.PROJECT_NOT_INITIALIZED.error}\n\n${MESSAGES.PROJECT_NOT_INITIALIZED.help}`;
}

/**
 * Helper function to get ceremony header
 * @param {string} ceremonyName - Name of ceremony ('sponsor-call', 'sprint-planning', 'seed')
 * @returns {object} Object with title and url properties
 */
export function getCeremonyHeader(ceremonyName) {
  const header = MESSAGES.CEREMONY_HEADERS[ceremonyName];
  if (!header) {
    throw new Error(`Unknown ceremony: ${ceremonyName}`);
  }
  return header;
}
