/**
 * @file Burndown web panel bundle
 * @description Self-contained browser module exporting the canonical chart
 * panel. It uses the React runtime supplied in panel props, so the extension
 * does not bundle a second React copy and hooks share Kandown's dispatcher.
 */

function pointsFor(task) {
  return Number(task.plugins?.burndown?.points) || 0;
}

function BurndownChart({ api, ui }) {
  const [stats, setStats] = ui.useState({ total: 0, done: 0 });

  ui.useEffect(() => {
    let active = true;
    void api.readAllTasks().then((tasks) => {
      if (!active) return;
      let total = 0;
      let done = 0;
      for (const task of tasks) {
        const points = pointsFor(task);
        total += points;
        if (task.frontmatter.status === 'Done') done += points;
      }
      setStats({ total, done });
    });
    return () => { active = false; };
  }, [api]);

  const percentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  return ui.createElement(
    'div',
    { style: { display: 'grid', gap: '10px' } },
    ui.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } },
      ui.createElement('span', null, `${stats.done} / ${stats.total} points done`),
      ui.createElement('strong', null, `${percentage}%`),
    ),
    ui.createElement(
      'div',
      { style: { height: '8px', overflow: 'hidden', borderRadius: '999px', background: 'var(--bg-2)' } },
      ui.createElement('div', {
        style: {
          width: `${percentage}%`,
          height: '100%',
          borderRadius: '999px',
          background: 'var(--primary)',
          transition: 'width 180ms ease',
        },
      }),
    ),
    ui.createElement('div', { style: { color: 'var(--fg-muted)', fontSize: '12px' } }, `${stats.total - stats.done} points remaining`),
  );
}

export const panels = { chart: BurndownChart };
