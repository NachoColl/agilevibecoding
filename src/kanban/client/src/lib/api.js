/**
 * API Client for AVC Kanban Board
 * Communicates with the backend Express server
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Fetch wrapper with error handling
 * @param {string} endpoint - API endpoint (relative to /api)
 * @param {object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * Get health check status
 * @returns {Promise<object>} Health status
 */
export async function getHealth() {
  return apiFetch('/health');
}

/**
 * Get statistics (counts by status/type)
 * @returns {Promise<object>} Statistics
 */
export async function getStats() {
  return apiFetch('/stats');
}

/**
 * Get all work items
 * @param {object} filters - Filter options
 * @param {string} filters.type - Filter by type (comma-separated: epic,story,task,subtask)
 * @param {string} filters.status - Filter by status (comma-separated)
 * @param {string} filters.search - Search query
 * @returns {Promise<object>} Work items data
 */
export async function getWorkItems(filters = {}) {
  const params = new URLSearchParams();

  if (filters.type) {
    params.append('type', filters.type);
  }
  if (filters.status) {
    params.append('status', filters.status);
  }
  if (filters.search) {
    params.append('search', filters.search);
  }

  const query = params.toString();
  const endpoint = query ? `/work-items?${query}` : '/work-items';

  return apiFetch(endpoint);
}

/**
 * Get work items grouped by column
 * @returns {Promise<object>} Grouped work items
 */
export async function getWorkItemsGrouped() {
  return apiFetch('/work-items/grouped');
}

/**
 * Get single work item with full details
 * @param {string} id - Work item ID
 * @returns {Promise<object>} Work item details
 */
export async function getWorkItem(id) {
  return apiFetch(`/work-items/${id}`);
}

/**
 * Get rendered documentation (doc.md) as HTML
 * @param {string} id - Work item ID
 * @returns {Promise<string>} HTML content or empty string if not found
 */
export async function getWorkItemDoc(id) {
  const url = `${API_BASE_URL}/work-items/${id}/doc`;
  const response = await fetch(url);

  if (!response.ok) {
    return ''; // Return empty string on error (404, etc.)
  }

  return await response.text();
}

/**
 * Get rendered context (context.md) as HTML
 * @param {string} id - Work item ID
 * @returns {Promise<string>} HTML content or empty string if not found
 */
export async function getWorkItemContext(id) {
  const url = `${API_BASE_URL}/work-items/${id}/context`;
  const response = await fetch(url);

  if (!response.ok) {
    return ''; // Return empty string on error (404, etc.)
  }

  return await response.text();
}
