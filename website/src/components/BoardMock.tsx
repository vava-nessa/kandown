/**
 * @file src/components/BoardMock.tsx
 * @description A static, pure-CSS rendering of a Kandown board.
 *
 * 📖 It serves two purposes: it is the fallback inside `<HeroVideo />` when no
 * screencast has been dropped into `public/`, and it illustrates the board
 * further down the landing page without shipping a screenshot that would go
 * stale the next time the product's theme changes.
 *
 * The cards are deliberately about *this* project, so the hero shows plausible
 * work rather than "Task 1 / Task 2".
 *
 * @exports BoardMock
 */

type Card = {
  title: string
  priority?: 'P1' | 'P2' | 'P3'
  tags?: string[]
  owner?: 'human' | 'ai'
  progress?: [done: number, total: number]
}

const COLUMNS: { name: string; cards: Card[] }[] = [
  {
    name: 'Backlog',
    cards: [
      { title: 'Sync board state over SSH', tags: ['cli'], priority: 'P3' },
      { title: 'Import a Trello export', tags: ['import'] },
    ],
  },
  {
    name: 'Todo',
    cards: [
      { title: 'Add due-date reminders', priority: 'P2', tags: ['ui'], owner: 'human' },
      { title: 'Document the MCP server', priority: 'P2', tags: ['docs'], owner: 'ai' },
      { title: 'Cache the search index', tags: ['perf'] },
    ],
  },
  {
    name: 'In progress',
    cards: [
      {
        title: 'Refactor auth middleware',
        priority: 'P1',
        tags: ['backend', 'security'],
        owner: 'ai',
        progress: [2, 4],
      },
      { title: 'Terminal UI drag & drop', priority: 'P2', tags: ['tui'], owner: 'human' },
    ],
  },
  {
    name: 'Done',
    cards: [
      { title: 'Ship dependency gate', tags: ['core'], owner: 'ai', progress: [3, 3] },
      { title: 'Write AGENTS.md', tags: ['docs'] },
    ],
  },
]

/**
 * 📖 Priority is shown as a mono code with a coloured leading bar rather than a
 * rounded pill. Pills read as generic UI chrome; a bar plus a code reads like a
 * tool that has opinions about what P1 means.
 */
const PRIORITY_STYLE: Record<string, string> = {
  P1: 'text-red-500 border-red-500',
  P2: 'text-amber-600 border-amber-500 dark:text-amber-400',
  P3: 'text-sky-600 border-sky-500 dark:text-sky-400',
}

export function BoardMock() {
  return (
    <div className="grid h-full w-full grid-cols-4 select-none">
      {COLUMNS.map((column, i) => (
        <div key={column.name} className={`min-w-0 ${i > 0 ? 'border-l border-border' : ''}`}>
          <div className="flex items-center justify-between gap-1.5 border-b border-border px-2.5 py-2">
            <span className="label truncate !text-[9.5px] text-fg">{column.name}</span>
            <span className="font-mono text-[9.5px] text-fg-faint">{column.cards.length}</span>
          </div>

          <div className="flex flex-col">
            {column.cards.map((card) => (
              <div key={card.title} className="border-b border-border px-2.5 py-2">
                <p className="text-[10.5px] leading-snug font-medium text-fg">{card.title}</p>

                {(card.tags?.length || card.priority || card.owner) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {card.priority && (
                      <span
                        className={`border-l-2 pl-1 font-mono text-[8.5px] font-medium ${PRIORITY_STYLE[card.priority]}`}
                      >
                        {card.priority}
                      </span>
                    )}
                    {card.tags?.map((tag) => (
                      <span key={tag} className="font-mono text-[8.5px] text-fg-faint">
                        #{tag}
                      </span>
                    ))}
                    {card.owner === 'ai' && (
                      <span className="bg-accent px-1 font-mono text-[8.5px] font-medium text-ink">
                        agent
                      </span>
                    )}
                  </div>
                )}

                {card.progress && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-[3px] flex-1 bg-bg-subtle">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${(card.progress[0] / card.progress[1]) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[8.5px] text-fg-faint">
                      {card.progress[0]}/{card.progress[1]}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
