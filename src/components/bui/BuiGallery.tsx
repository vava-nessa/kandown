/**
 * @file Hidden BeautifulUI component gallery
 * @description Development surface for the BeautifulUI ports (beautifului.dev,
 * MIT): every component and every variant rendered on one page, inside the
 * scoped `.bui` design system. Reached by opening Kandown on `#bui`; it
 * replaces the app entirely for that tab, so it never leaks into the product
 * UI. New ports land here first, then graduate into the chat.
 *
 * @functions
 *  → BuiGallery: the one-page gallery
 *
 * @exports BuiGallery
 * @see src/components/bui/LoadingState.tsx
 * @see src/components/bui/ThinkingState.tsx
 * @see src/components/bui/StreamingText.tsx
 * @see src/components/bui/ApprovalCard.tsx
 */

import LoadingState from './LoadingState';
import ThinkingState from './ThinkingState';
import StreamingText from './StreamingText';
import ApprovalCard from './ApprovalCard';
import ChatSection from './gallery/ChatSection';
import CardsSection from './gallery/CardsSection';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{title}</h2>
      <div className="flex flex-wrap items-start gap-8">{children}</div>
    </section>
  );
}

export default function BuiGallery() {
  return (
    <div className="min-h-screen bg-canvas px-8 py-8 text-ink" style={{ background: 'var(--page)' }}>
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">BeautifulUI gallery</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Ported components from beautifului.dev (MIT) on the scoped .bui tokens. Hidden surface: open Kandown on #bui.
          </p>
        </div>
        <a href="#" className="text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Back to the board
        </a>
      </header>
      <main className="max-w-4xl space-y-12">
        <Section title="01 Loading state">
          <LoadingState label="Churning" variant="Drive" />
          <LoadingState label="Thinking" variant="Dots" />
          <LoadingState label="Orbiting" variant="Orbit" />
          <LoadingState variant="Surfer" />
        </Section>
        <Section title="02 Thinking">
          <ThinkingState variant="Steps" />
          <ThinkingState variant="Reasoning" />
          <ThinkingState variant="Search" />
          <ThinkingState variant="Coding" />
        </Section>
        <Section title="03 Streaming text">
          <StreamingText loop />
        </Section>
        <Section title="04 Approval card">
          <ApprovalCard />
        </Section>
        <ChatSection />
        <CardsSection />
      </main>
    </div>
  );
}
