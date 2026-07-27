/**
 * @file src/components/StructuredData.tsx
 * @description The homepage's JSON-LD block — the machine-readable description
 * of what Kandown is, for the crawlers that read structured data rather than
 * guessing from prose.
 *
 * 📖 **What this buys.** Meta tags say how to *display* a link; JSON-LD says
 * what the thing *is*. Declaring `SoftwareApplication` lets a search engine
 * classify Kandown as software rather than as an article that mentions
 * software, and read its category, platform, licence and price as facts instead
 * of inferring them. It is the same information the page already states in
 * English, restated in the vocabulary schema.org readers expect.
 *
 * 📖 **Why the homepage only.** The graph describes the product, and the
 * homepage is the page about the product. Repeating it under every
 * documentation page would assert that each one is a separate piece of
 * software — noise at best, and a reason for a validator to start ignoring the
 * block at worst.
 *
 * 📖 **Every field is derived or verifiable**, which is the rule that matters
 * here. Names, URLs and the description come from `~/lib/site`, the same
 * constants the meta tags and `llms.txt` use, so the structured data cannot
 * drift from what the page says. Notably absent is `aggregateRating`: there are
 * no ratings to report, and inventing them is both a policy violation and a
 * fast route to a manual penalty.
 *
 * 📖 `offers` at price `0` is not a formality — it is how a crawler learns the
 * software is free, and it is what surfaces the "Free" annotation on a result.
 * Kandown is MIT-licensed and installed from npm, so this is simply true.
 *
 * 📖 Rendered as a plain `<script>` in the page body. JSON-LD is valid anywhere
 * in the document, and keeping it in the component tree means it prerenders
 * with the rest of the page — no head plumbing, no client-side injection a
 * crawler might miss.
 *
 * @exports HomeStructuredData — the `@graph` block for `/`
 * @see website/src/routes/__root.tsx — the meta and canonical tags it complements
 */
import { site } from '~/lib/site'

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      url: site.url,
      name: site.name,
      description: site.description,
      inLanguage: 'en',
      publisher: { '@id': `${site.url}/#author` },
    },
    {
      '@type': 'Person',
      '@id': `${site.url}/#author`,
      name: site.author,
      url: site.authorUrl,
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${site.url}/#software`,
      name: site.name,
      description: site.description,
      url: site.url,
      // 📖 `DeveloperApplication` is the closest schema.org category: a tool
      // used while building software, not a productivity app for general use.
      applicationCategory: 'DeveloperApplication',
      // 📖 Kandown is a Node CLI with a local web UI and a TUI — it runs
      // wherever Node does, which is all three desktop platforms.
      operatingSystem: 'macOS, Windows, Linux',
      softwareRequirements: 'Node.js',
      downloadUrl: site.npm,
      installUrl: site.npm,
      codeRepository: site.repo,
      sameAs: [site.repo, site.npm, site.reddit],
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      author: { '@id': `${site.url}/#author` },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ],
}

export function HomeStructuredData() {
  return (
    <script
      type="application/ld+json"
      // 📖 The payload is a literal built at module scope from constants — no
      // user input can reach it, so there is nothing here to escape.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
