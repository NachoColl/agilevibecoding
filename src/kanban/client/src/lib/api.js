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

/**
 * Get raw markdown source of doc.md
 * @param {string} id - Work item ID
 * @returns {Promise<string>} Raw markdown or empty string if not found
 */
export async function getWorkItemDocRaw(id) {
  const url = `${API_BASE_URL}/work-items/${id}/doc/raw`;
  const response = await fetch(url);
  if (!response.ok) return '';
  return await response.text();
}

/**
 * Get raw markdown source of context.md
 * @param {string} id - Work item ID
 * @returns {Promise<string>} Raw markdown or empty string if not found
 */
export async function getWorkItemContextRaw(id) {
  const url = `${API_BASE_URL}/work-items/${id}/context/raw`;
  const response = await fetch(url);
  if (!response.ok) return '';
  return await response.text();
}

/**
 * Save updated markdown to doc.md
 * @param {string} id - Work item ID
 * @param {string} content - Markdown content
 */
export async function updateWorkItemDoc(id, content) {
  return apiFetch(`/work-items/${id}/doc`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

/**
 * Save updated markdown to context.md
 * @param {string} id - Work item ID
 * @param {string} content - Markdown content
 */
export async function updateWorkItemContext(id, content) {
  return apiFetch(`/work-items/${id}/context`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ── Board settings ───────────────────────────────────────────────────────────

/**
 * Get board title from avc.json (falls back to 'AVC Kanban Board')
 */
export async function getBoardTitle() {
  const data = await apiFetch('/settings/title');
  return data.title || 'AVC Kanban Board';
}

export async function getDocsUrl() {
  const data = await apiFetch('/settings/docs-url');
  return data.url || 'http://localhost:4173';
}

/**
 * Save board title to avc.json
 */
export async function updateBoardTitle(title) {
  return apiFetch('/settings/title', {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}

// ── Project-level (root) files ──────────────────────────────────────────────

export async function getProjectDoc() {
  const url = `${API_BASE_URL}/project/doc`;
  const response = await fetch(url);
  if (!response.ok) return '';
  return response.text();
}

export async function getProjectDocRaw() {
  const url = `${API_BASE_URL}/project/doc/raw`;
  const response = await fetch(url);
  if (!response.ok) return '';
  return response.text();
}

export async function updateProjectDoc(content) {
  return apiFetch('/project/doc', { method: 'PUT', body: JSON.stringify({ content }) });
}

export async function getProjectContext() {
  const url = `${API_BASE_URL}/project/context`;
  const response = await fetch(url);
  if (!response.ok) return '';
  return response.text();
}

export async function getProjectContextRaw() {
  const url = `${API_BASE_URL}/project/context/raw`;
  const response = await fetch(url);
  if (!response.ok) return '';
  return response.text();
}

export async function updateProjectContext(content) {
  return apiFetch('/project/context', { method: 'PUT', body: JSON.stringify({ content }) });
}

export async function getProjectStatus() {
  return apiFetch('/project/status');
}

// ── Settings API ─────────────────────────────────────────────────────────────

export async function getSettings() {
  return apiFetch('/settings');
}

export async function saveApiKeys(keys) {
  return apiFetch('/settings/api-keys', { method: 'PUT', body: JSON.stringify(keys) });
}

export async function saveCeremonies(ceremonies, missionGenerator) {
  return apiFetch('/settings/ceremonies', { method: 'PUT', body: JSON.stringify({ ceremonies, missionGenerator }) });
}

export async function saveGeneralSettings(data) {
  return apiFetch('/settings/general', { method: 'PUT', body: JSON.stringify(data) });
}

export async function saveModelPricing(models) {
  return apiFetch('/settings/models', { method: 'PUT', body: JSON.stringify({ models }) });
}

export async function saveCostThresholds(thresholds) {
  return apiFetch('/settings/cost-thresholds', { method: 'PUT', body: JSON.stringify({ thresholds }) });
}

// ── Ceremony API ─────────────────────────────────────────────────────────────

export async function getCeremonyStatus() {
  return apiFetch('/ceremony/status');
}

export async function analyzeDatabase(mission, scope, strategy) {
  return apiFetch('/ceremony/analyze/database', {
    method: 'POST',
    body: JSON.stringify({ mission, scope, strategy }),
  });
}

export async function analyzeArchitecture(mission, scope, dbContext, strategy) {
  return apiFetch('/ceremony/analyze/architecture', {
    method: 'POST',
    body: JSON.stringify({ mission, scope, dbContext, strategy }),
  });
}

export async function prefillAnswers(mission, scope, arch, dbContext, strategy) {
  return apiFetch('/ceremony/analyze/prefill', {
    method: 'POST',
    body: JSON.stringify({ mission, scope, arch, dbContext, strategy }),
  });
}

export async function runCeremony(requirements) {
  return apiFetch('/ceremony/run', {
    method: 'POST',
    body: JSON.stringify({ requirements }),
  });
}

export async function runSprintPlanning() {
  return apiFetch('/ceremony/sprint-planning/run', { method: 'POST' });
}

export const pauseCeremony  = () => apiFetch('/ceremony/pause',  { method: 'POST' });
export const resumeCeremony = () => apiFetch('/ceremony/resume', { method: 'POST' });
export const cancelCeremony = () => apiFetch('/ceremony/cancel', { method: 'POST' });
export const resetCeremony  = () => apiFetch('/ceremony/reset',  { method: 'POST' });

export async function getModels() {
  return apiFetch('/ceremony/models');
}

export async function generateMission(description, modelId, provider, validatorModelId, validatorProvider) {
  return apiFetch('/ceremony/generate-mission', {
    method: 'POST',
    body: JSON.stringify({ description, modelId, provider, validatorModelId, validatorProvider }),
  });
}

export async function refineMission(missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId, validatorProvider) {
  return apiFetch('/ceremony/refine-mission', {
    method: 'POST',
    body: JSON.stringify({ missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId, validatorProvider }),
  });
}

// ── Sponsor-call draft (resume support) ──────────────────────────────────────

export async function getSponsorCallDraft() {
  try {
    return await apiFetch('/ceremony/sponsor-call/draft');
  } catch (_) {
    return null;
  }
}

export async function saveSponsorCallDraft(data) {
  return apiFetch('/ceremony/sponsor-call/draft', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSponsorCallDraft() {
  try {
    return await apiFetch('/ceremony/sponsor-call/draft', { method: 'DELETE' });
  } catch (_) {}
}

// ── Agents API ───────────────────────────────────────────────────────────────

export async function getAgentList() {
  return apiFetch('/settings/agents');
}

export async function getAgentContent(name) {
  return apiFetch(`/settings/agents/${encodeURIComponent(name)}`);
}

export async function saveAgentContent(name, content) {
  return apiFetch(`/settings/agents/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function resetAgent(name) {
  return apiFetch(`/settings/agents/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ── Processes API ─────────────────────────────────────────────────────────────

export async function getProcesses() {
  return apiFetch('/processes');
}

export async function killProcess(id) {
  return apiFetch(`/processes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearCompletedProcesses() {
  return apiFetch('/processes', { method: 'DELETE' });
}

// ── Costs API ─────────────────────────────────────────────────────────────────

/**
 * Get current month cost summary for the header chip
 * @returns {Promise<{ totalCost: number, totalTokens: number, apiCalls: number }>}
 */
export async function getCostSummary() {
  return apiFetch('/costs/summary');
}

/**
 * Get cost history for chart and ceremony breakdown
 * @param {number|{ from: string, to: string }} range - Days count or custom date range
 * @returns {Promise<{ daily: Array, ceremonies: Array }>}
 */
export async function getCostHistory(range = 30) {
  if (typeof range === 'number') {
    return apiFetch(`/costs/history?days=${range}`);
  }
  return apiFetch(`/costs/history?from=${range.from}&to=${range.to}`);
}
