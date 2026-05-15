# DESIGN_IMPROVEMENTS.md

## Executive Summary

Kandown provides a highly functional, local-first Kanban experience. However, its visual design and user experience (UX) could benefit from more modern, consistent, and polished execution. This document analyzes the current state of the UI and proposes concrete improvements across typography, color palette, layout, spacing, and specific components.

## Current UI/UX Analysis

### Strengths
- **Clean aesthetic:** The app avoids unnecessary clutter and uses a fairly minimal approach.
- **Animation:** The use of `motion/react` provides a good foundation for fluid interactions.
- **Customizability:** The theme engine is powerful, offering multiple skins, backgrounds, and density settings.
- **Functionality-first:** The UI directly reflects the core functionality of markdown-backed Kanban boards.

### Weaknesses
1. **Inconsistent Component Polish:** Some buttons use older variants (`btn-base` vs `Button`), and icon alignment is sometimes slightly off.
2. **Typography Hierarchy:** The typographic scale can feel slightly flat. The distinction between headings, subheadings, and body text in the drawer and settings could be sharper.
3. **Contrast and Accessibility:** Certain faint text colors (`fg-faint`, `fg-muted`) against some backgrounds might lack sufficient contrast, particularly in the "Graphite" or "Sage" themes.
4. **Spacing & Alignment:** There are minor inconsistencies in padding within cards and the drawer. The drawer, in particular, feels cramped when many fields are visible.
5. **Lack of Visual Depth:** Despite the shadow utilities, some panels (like the filter bar or settings dropdowns) lack distinct elevation or boundary definition.
6. **Form Elements:** Input fields in the drawer and settings sometimes lack clear focus states or look too "default" compared to the rest of the UI.

## Proposed Improvements

### 1. Typography & Hierarchy

**Issue:** The hierarchy isn't always immediately clear.
**Solution:** Refine the typographic scale to create more contrast between elements.

*   **Actionable Code:**
    In `tailwind.config.js` or `globals.css`, define a stricter set of text utilities.
    Instead of using raw text sizes like `text-[13.5px]`, use standard Tailwind classes (e.g., `text-sm`, `text-xs`) but redefine them in the config if needed.

    ```css
    /* globals.css */
    @layer utilities {
      .text-heading-1 { @apply text-2xl font-bold tracking-tight text-fg; }
      .text-heading-2 { @apply text-lg font-semibold tracking-tight text-fg; }
      .text-body { @apply text-sm text-fg leading-relaxed; }
      .text-caption { @apply text-xs font-medium text-fg-muted uppercase tracking-wider; }
    }
    ```

### 2. Layout, Spacing, and Card Polish

**Issue:** Cards can feel a bit boxy, and the drawer gets cluttered.
**Solution:** Standardize padding and add subtle visual cues.

*   **Actionable Code - `Card.tsx`:**
    Improve the card hover state and internal spacing.
    ```tsx
    // Replace:
    // className="... p-3.5 shadow-sm transition-all hover:border-border-strong hover:shadow-md"

    // With:
    className="group relative cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 ease-in-out hover:-translate-y-1 hover:border-border-focus hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    ```

*   **Actionable Code - `Drawer.tsx`:**
    Group metadata fields logically and use a slightly more distinct background for the form area.
    ```tsx
    // For FieldRow, add a subtle background on hover to show interactivity
    function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
      return (
        <div className="grid grid-cols-[120px_1fr] items-center gap-4 text-sm py-1 px-2 -mx-2 rounded-md hover:bg-bg-2/50 transition-colors">
          <span className="text-fg-muted font-medium">{label}</span>
          <div>{children}</div>
        </div>
      );
    }
    ```

### 3. Component Consistency (Buttons & Form Elements)

**Issue:** Mixed use of button styles and generic select/input fields.
**Solution:** Standardize on the `Button` component and create a unified `Input` / `Select` component.

*   **Actionable Code:**
    Ensure all buttons use the `ui/button.tsx` standard.
    For inputs, create a standard class or component:
    ```css
    /* Add to globals.css @layer components */
    .form-input {
      @apply flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50;
    }
    ```
    Then, in `SettingsPage.tsx` and `Drawer.tsx`, replace raw `<select>` and `<input>` classes with `className="form-input"`.

### 4. Visual Depth and Borders

**Issue:** Boundaries between panels sometimes blur.
**Solution:** Improve the `glass` utility and border definitions.

*   **Actionable Code - `globals.css`:**
    Make the glass effect slightly more pronounced.
    ```css
    .glass {
      background: hsl(var(--glass) / 0.85); /* Slightly more opaque for readability */
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid hsl(var(--glass-border) / 0.15); /* Softer border */
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    }
    ```

### 5. Accessibility (A11y)

**Issue:** Focus states are missing on custom interactive elements (like the card click area).
**Solution:** Ensure all interactive elements have visible focus rings.

*   **Actionable Code:**
    Add `focus-visible` utilities to cards and custom buttons.
    ```tsx
    // In Card.tsx
    // Add: focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
    ```

### 6. Empty State Polish

**Issue:** The empty state can feel a bit stark.
**Solution:** Add subtle animations to the recent projects list and make the primary action more prominent.

*   **Actionable Code - `EmptyState.tsx`:**
    ```tsx
    // Make the recent projects list more interactive
    <button
      key={p.id}
      onClick={() => openRecentProject(p)}
      className="w-full text-left px-4 py-2.5 text-sm text-fg-dim hover:text-fg hover:bg-bg-2 rounded-lg transition-all active:scale-[0.98] border border-transparent hover:border-border"
    >
      <span className="flex items-center gap-2">
        <Icon.Folder size={14} className="text-fg-muted" />
        {p.name}
      </span>
    </button>
    ```

## Conclusion

By standardizing components, refining the typographic scale, and enhancing visual depth through shadows and subtle borders, Kandown's UI can be significantly modernized while maintaining its fast, lightweight feel.