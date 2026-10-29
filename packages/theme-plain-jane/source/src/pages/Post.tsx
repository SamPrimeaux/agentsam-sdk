import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import type { CMSPage } from "../data/cms";
import { fetchPageBySlug, useSEO } from "../data/cms";
import { RenderSection, JournalHeaderSection, JournalFooterSection } from "../render/registry";

export function Post() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CMSPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useSEO(page);

  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    void fetchPageBySlug(slug).then((p) => {
      setPage(p);
      setIsLoading(false);
    });
  }, [slug]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-muted)] font-serif text-lg">
        Loading story...
      </div>
    );
  }

  if (!page) {
    return <Navigate to="/" replace />;
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
