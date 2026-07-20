/**
 * @file Task URL helpers
 * @description Parses and writes deep-link URLs for task drawers. Kandown is
 * served as a single-page app, so the browser URL is just UI state: opening a
 * task maps to `/<task-number>?p=<project>` while the board itself remains
 * `/?p=<project>`. The parser is intentionally liberal and also accepts the
 * older/typed form `?p=<project>/<task-number>` so pasted links keep working.
 *
 * @functions
 *  → normalizeTaskRouteId — convert URL task segments into canonical ids
 *  → getProjectSlugFromLocation — read the project slug from `?p=`
 *  → getTaskIdFromLocation — read the task id from path/query URL state
 *  → buildBoardUrl — build the board-only browser URL
 *  → buildTaskUrl — build the canonical task deep-link URL
 *
 * @exports normalizeTaskRouteId, getProjectSlugFromLocation, getTaskIdFromLocation, buildBoardUrl, buildTaskUrl
 */

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 📖 Turns `210`, `t210`, or a custom slug into the canonical task id used on disk. */
export function normalizeTaskRouteId(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, '').replace(/^#/, '');
  if (!cleaned || cleaned.includes('/') || cleaned.includes('.') || !TASK_ID_PATTERN.test(cleaned)) return null;
  return /^\d+$/.test(cleaned) ? `t${cleaned}` : cleaned;
}

/** 📖 Extracts the project part from `?p=kandown` or tolerant `?p=kandown/210`. */
export function getProjectSlugFromLocation(location: Pick<Location, 'search'>): string | null {
  const rawProject = new URLSearchParams(location.search).get('p');
  if (!rawProject) return null;
  const [project] = rawProject.split('/').filter(Boolean);
  return project || null;
}

/** 📖 Reads the task id from `/210?p=kandown`, `?task=210`, or `?p=kandown/210`. */
export function getTaskIdFromLocation(location: Pick<Location, 'pathname' | 'search'>): string | null {
  const params = new URLSearchParams(location.search);
  const explicitTask = normalizeTaskRouteId(params.get('task'));
  if (explicitTask) return explicitTask;

  const rawProject = params.get('p');
  if (rawProject) {
    const [, ...taskParts] = rawProject.split('/').filter(Boolean);
    const taskFromProject = normalizeTaskRouteId(taskParts.join('/'));
    if (taskFromProject) return taskFromProject;
  }

  const pathTask = normalizeTaskRouteId(decodeURIComponent(location.pathname));
  return pathTask;
}

/** 📖 Board URL keeps only the project query param, removing any task segment. */
export function buildBoardUrl(projectName: string | null): string {
  return projectName ? `/?p=${encodeURIComponent(projectName)}` : '/';
}

/** 📖 Canonical shareable task URL: `/210?p=kandown` for `t210`. */
export function buildTaskUrl(taskId: string, projectName: string | null): string {
  const displayId = taskId.replace(/^t(?=\d+$)/, '');
  const path = `/${encodeURIComponent(displayId)}`;
  return projectName ? `${path}?p=${encodeURIComponent(projectName)}` : path;
}
