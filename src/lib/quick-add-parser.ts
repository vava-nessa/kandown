/**
 * @file Quick-add inline syntax parser
 * @description Parses inline metadata annotations in task title strings:
 *  - `p1` / `p2` / `p3` / `p4` → priority (`P1`, `P2`, `P3`, `P4`)
 *  - `#tag` → tags array (`['tag']`)
 *  - `@assignee` → assignee string (`'assignee'`)
 *  - `due:friday` / `due:today` / `due:tomorrow` / `due:YYYY-MM-DD` → due date string
 *  - `+t12` → depends_on array (`['t12']`)
 *
 * @exports parseQuickAddInput, QuickAddParsed
 */

export interface QuickAddParsed {
  title: string;
  priority?: string;
  tags?: string[];
  assignee?: string;
  due?: string;
  depends_on?: string[];
}

function resolveDueDate(raw: string): string {
  const lower = raw.toLowerCase();
  const today = new Date();
  if (lower === 'today') {
    return today.toISOString().split('T')[0];
  }
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (daysOfWeek.includes(lower)) {
    const targetDay = daysOfWeek.indexOf(lower);
    const d = new Date(today);
    let diff = targetDay - d.getDay();
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }
  return raw;
}

export function parseQuickAddInput(raw: string): QuickAddParsed {
  let text = raw.trim();
  let priority: string | undefined;
  const tags: string[] = [];
  let assignee: string | undefined;
  let due: string | undefined;
  const depends_on: string[] = [];

  // Parse priority: p1, p2, p3, p4
  text = text.replace(/(?:^|\s)p([1-4])(?:\s|$)/i, (_, level) => {
    priority = `P${level}`;
    return ' ';
  });

  // Parse tags: #tagname
  text = text.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return ' ';
  });

  // Parse assignee: @username
  text = text.replace(/(?:^|\s)@([a-zA-Z0-9_-]+)/g, (_, user) => {
    assignee = user;
    return ' ';
  });

  // Parse due date: due:YYYY-MM-DD or due:today / due:tomorrow / due:friday
  text = text.replace(/(?:^|\s)due:([^\s]+)/i, (_, dateStr) => {
    due = resolveDueDate(dateStr);
    return ' ';
  });

  // Parse dependency: +t12 or +task-id
  text = text.replace(/(?:^|\s)\+([a-zA-Z0-9_-]+)/g, (_, depId) => {
    depends_on.push(depId);
    return ' ';
  });

  const title = text.replace(/\s+/g, ' ').trim();

  return {
    title: title || raw,
    ...(priority ? { priority } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(assignee ? { assignee } : {}),
    ...(due ? { due } : {}),
    ...(depends_on.length > 0 ? { depends_on } : {}),
  };
}
