import { useEffect, useState } from "react";
import type { CMSPage } from "../data/cms";
import { fetchPageBySlug, useSEO } from "../data/cms";
import { RenderSection, JournalHeaderSection, JournalFooterSection } from "../render/registry";

export function Home() {
  const [page, setPage] = useState<CMSPage | null>(null);

  useSEO(page);

  useEffect(() => {
    void fetchPageBySlug("home").then((p) => {
      if (p) setPage(p);
    });
  }, []);

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-muted)] font-serif text-lg">
        Loading journal...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <JournalHeaderSection
        section={{
          id: "sec-header-nav",
          page_id: page.id,
          definition_key: "journal-header",
          version: "1.0.0",
          template_sku: "tpl-journal-header-default",
          section_order: 0,
          section_data: {},
          status: "active",
          blocks: [],
        }}
        page={page}
      />

      <main className="flex-1">
        {page.sections.map((section) => (
          <RenderSection key={section.id} section={section} page={page} />
        ))}
      </main>

      <JournalFooterSection
        section={{
          id: "sec-footer-nav",
          page_id: page.id,
          definition_key: "journal-footer",
          version: "1.0.0",
          template_sku: "tpl-journal-footer-default",
          section_order: 99,
          section_data: {},
          status: "active",
          blocks: [],
        }}
        page={page}
      />
    </div>
  );
}
