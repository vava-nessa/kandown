/**
 * @file src/components/DevWarning.tsx
 * @description Top-of-every-page banner flagging that Kandown is in active
 * development and should not be used in production until v1.0.0. Mounted by
 * the root route above the marketing header so it is the first thing the
 * visitor reads; suppressed on `/app` where the in-browser app does not need
 * to repeat the warning.
 *
 * 📖 The banner is intentionally persistent (no dismiss). vava runs a
 * build-in-public loop and wants the warning front-and-center until the
 * first stable release ships.
 *
 * @see src/routes/__root.tsx — the only consumer.
 */

export function DevWarning() {
  return (
    <div
      role="status"
      className="w-full"
      style={{
        background: 'rgb(254 243 199 / 0.96)',
        borderBottom: '1px solid rgb(252 211 77)',
        color: 'rgb(120 53 15)',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-5 py-2 text-[13px] leading-snug sm:items-center">
        <span aria-hidden="true" className="flex-none text-base">
          ⚠️
        </span>
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Active development — do not use in production yet.</strong>{' '}
          <span className="opacity-90">
            Build-in-public project. First stable release:{' '}
            <strong className="font-semibold">v1.0.0</strong>. Expect breaking changes, missing features and rough edges before then.
          </span>
        </p>
      </div>
    </div>
  )
}