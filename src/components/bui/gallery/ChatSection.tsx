/**
 * @file Chat section of the BeautifulUI gallery
 * @description Gallery block for the chat-side BeautifulUI ports
 * (beautifului.dev, MIT): task rows, the chat composer, the prompt bar and
 * command search and tool chips, each variant under its own numbered
 * uppercase heading, matching the section style of BuiGallery. Rendered
 * inside the scoped `.bui` page wrapper, which supplies every token the
 * components use.
 *
 * @functions
 *  → Heading: small uppercase numbered section title
 *  → ChatSection: the fragment of gallery subsections
 *
 * @exports ChatSection
 * @see src/components/bui/BuiGallery.tsx
 */

import ToolChips from "../ToolChips";
import TaskRows from "../TaskRows";
import ChatComposer from "../ChatComposer";
import PromptBar from "../PromptBar";
import SearchList from "../SearchList";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{children}</h2>
  );
}

export default function ChatSection() {
  return (
    <>
      <section className="mb-10">
        <Heading>01 Tool chips</Heading>
        <div className="flex flex-wrap items-start gap-8">
          <ToolChips />
        </div>
      </section>
      <section className="mb-10">
        <Heading>02 Task rows</Heading>
        <div className="flex flex-wrap items-start gap-8">
          <TaskRows />
          <TaskRows variant="List" />
        </div>
      </section>
      <section className="mb-10">
        <Heading>03 Chat composer</Heading>
        <div className="flex flex-wrap items-start gap-8">
          <ChatComposer />
        </div>
      </section>
      <section className="mb-10">
        <Heading>04 Prompt bar</Heading>
        <div className="flex flex-wrap items-start gap-8">
          <PromptBar />
          <PromptBar variant="Pill" />
        </div>
      </section>
      <section className="mb-10">
        <Heading>05 Search</Heading>
        <div className="flex flex-wrap items-start gap-8">
          <SearchList />
        </div>
      </section>
    </>
  );
}
