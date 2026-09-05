/**
 * @file BeautifulUI gallery section: cards, tables and bars
 * @description Development surface for the second wave of BeautifulUI ports
 * (beautifului.dev, MIT): every card, table, nav and action component and
 * its variants rendered on one page, inside the scoped `.bui` design system
 * that main.tsx wraps the gallery with. Kept separate from BuiGallery.tsx so
 * the earlier sections stay untouched; reached through the same `#bui` hash.
 *
 * @functions
 *  → CardsSection: renders the 06 to 14 gallery sections
 *
 * @exports CardsSection
 * @see src/components/bui/BuiGallery.tsx
 */

import RecommendationCard from "../RecommendationCard";
import ContextCards from "../ContextCards";
import DiffTable from "../DiffTable";
import FilterTable from "../FilterTable";
import FineTuneCard from "../FineTuneCard";
import RecordsTable from "../RecordsTable";
import SidebarNav from "../SidebarNav";
import SelectionActions from "../SelectionActions";
import InsightCards from "../InsightCards";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{title}</h2>
      <div className="flex flex-wrap items-start gap-8">{children}</div>
    </section>
  );
}

export default function CardsSection() {
  return (
    <>
      <Section title="06 Recommendation card">
        <RecommendationCard />
      </Section>
      <Section title="07 Context cards">
        <ContextCards />
      </Section>
      <Section title="08 Diff table">
        <DiffTable />
      </Section>
      <Section title="09 Filter table">
        <FilterTable />
      </Section>
      <Section title="10 Fine-tune card">
        <FineTuneCard />
      </Section>
      <Section title="11 Records table">
        <RecordsTable />
      </Section>
      <Section title="12 Sidebar nav">
        <SidebarNav />
      </Section>
      <Section title="13 Selection actions">
        <SelectionActions />
      </Section>
      <Section title="14 Insight cards">
        <InsightCards />
      </Section>
    </>
  );
}
