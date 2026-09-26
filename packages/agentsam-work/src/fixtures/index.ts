import type { WorkHost, WorkSnapshot } from "../contracts/index";

export const populatedWorkFixture: WorkSnapshot = {
  fixtureName: "populated",
  nav: [
    { id: "calendar", label: "Calendar", href: "/collaborate", group: "work" },
    { id: "tickets", label: "Tickets", href: "/collaborate?seg=tickets", group: "work" },
    { id: "mail", label: "Mail", href: "/mail", group: "work" },
    { id: "projects", label: "Projects", href: "/projects", group: "work" },
    { id: "artifacts", label: "My artifacts", href: "/artifacts", group: "files" },
    { id: "r2", label: "R2 Storage", href: "/artifacts?source=r2", group: "files" },
    { id: "google-drive", label: "Google Drive", href: "/artifacts?source=google-drive", group: "files" },
    { id: "shared-drives", label: "Shared drives", href: "/artifacts?source=shared-drives", group: "files" },
    { id: "local-folder", label: "Local folder", href: "/artifacts?source=local", group: "files" },
    { id: "shared-with-me", label: "Shared with me", href: "/artifacts?view=shared", group: "files" },
    { id: "recent", label: "Recent", href: "/artifacts?view=recent", group: "files" },
    { id: "starred", label: "Starred", href: "/artifacts?view=starred", group: "files" },
    { id: "trash", label: "Trash", href: "/artifacts?view=trash", group: "files" }
  ],
  tickets: [
    {
      id: "tkt_3025af817d0f402a",
      title: "Multi-agent swarm/mode consolidation — spawn tree, mode policy, MCP server v2.6.47",
      description: "Close in review with proof before advancing the routing spine.",
      status: "in_review",
      priority: "P0",
      project: "agentsam-sdk",
      tags: ["agent-swarm"],
      blockedBy: [],
      blocks: ["tkt_reward_events_tenant"],
      surface: "platform",
      updatedAt: 1790455200
    },
    {
      id: "tkt_telemetry_002",
      title: "Image intent in-review set",
      description: "Likely code already landed — need pass/fail proof.",
      status: "in_review",
      priority: "P0",
      project: "agentsam-sdk",
      tags: ["telemetry"],
      blockedBy: [],
      blocks: [],
      surface: "collaborate",
      updatedAt: 1790451600
    },
    {
      id: "tkt_finding_3_pending_status",
      title: "Finding #3 pending status",
      description: "Unblocks ledger ownership B.",
      status: "active",
      priority: "P1",
      project: "agentsam-sdk",
      tags: ["ledger"],
      blockedBy: [],
      blocks: ["tkt_ledger_ownership_b"],
      surface: "collaborate",
      updatedAt: 1790448000
    },
    {
      id: "tkt_p0_infer_intent_heuristically",
      title: "Infer intent heuristically",
      description: "Parent poisoner for routing SSOT.",
      status: "blocked",
      priority: "P0",
      project: "agentsam-sdk",
      tags: ["routing"],
      blockedBy: ["tkt_finding_3_pending_status"],
      blocks: [],
      surface: "collaborate",
      updatedAt: 1790444400
    },
    {
      id: "tkt_reward_events_tenant",
      title: "Reward events tenant consolidation",
      description: "Unlocks cost_mean and arm consolidation.",
      status: "backlog",
      priority: "P1",
      project: "agentsam-sdk",
      tags: ["reward"],
      blockedBy: ["tkt_3025af817d0f402a"],
      blocks: [],
      surface: "platform",
      updatedAt: 1790440800
    }
  ],
  artifacts: [
    {
      id: "artifact-1",
      name: "Agent swarm architecture",
      kind: "image",
      source: "artifacts",
      preview: "gradient",
      mime: "image/png",
      sizeLabel: "1.4 MB",
      updatedLabel: "Today"
    },
    {
      id: "artifact-2",
      name: "runtime-receipts.md",
      kind: "document",
      source: "artifacts",
      mime: "text/markdown",
      sizeLabel: "24 KB",
      updatedLabel: "Today"
    },
    {
      id: "artifact-3",
      name: "settings-contract.ts",
      kind: "code",
      source: "artifacts",
      mime: "text/typescript",
      sizeLabel: "12 KB",
      updatedLabel: "Yesterday"
    },
    {
      id: "artifact-4",
      name: "work-shell-scaffold.zip",
      kind: "archive",
      source: "r2",
      mime: "application/zip",
      sizeLabel: "8.6 MB",
      updatedLabel: "Yesterday"
    },
    {
      id: "artifact-5",
      name: "product-hero.png",
      kind: "image",
      source: "google-drive",
      preview: "gradient",
      mime: "image/png",
      sizeLabel: "3.2 MB",
      updatedLabel: "Sep 25"
    },
    {
      id: "artifact-6",
      name: "terminal-log.txt",
      kind: "document",
      source: "local",
      mime: "text/plain",
      sizeLabel: "86 KB",
      updatedLabel: "Sep 24"
    }
  ],
  projects: [
    {
      id: "proj_companions_cpas_web",
      name: "Companions of CPAS",
      description: "Community website and content platform",
      projectType: "dashboard",
      status: "active",
      progress: 42,
      coverImageUrl: "fixture:companions",
      initials: "CO",
      accent: "#e2a638",
      githubRepo: "SamPrimeaux/companionscpas",
      openTasks: 0,
      trackedMinutes: 0
    },
    {
      id: "proj_swamp_blood",
      name: "Swamp Blood Gator Guides — CF-Native",
      description: "Guide commerce and booking platform",
      projectType: "e-commerce",
      status: "active",
      progress: 18,
      coverImageUrl: null,
      initials: "SC",
      accent: "#31c6e3",
      githubRepo: "SamPrimeaux/swampbloodgatorguides",
      openTasks: 4,
      trackedMinutes: 73
    },
    {
      id: "proj_agentsam_remix",
      name: "AgentSamRemix",
      description: "Agent product experimentation",
      projectType: "dashboard",
      status: "active",
      progress: 64,
      coverImageUrl: null,
      initials: "IN",
      accent: "#24cfe8",
      githubRepo: "SamPrimeaux/AgentSamRemix",
      openTasks: 8,
      trackedMinutes: 128
    },
    {
      id: "proj_anything_floors_site",
      name: "Anything Floors & More Website",
      description: "Commerce storefront",
      projectType: "e-commerce",
      status: "production",
      progress: 88,
      coverImageUrl: null,
      initials: "AN",
      accent: "#ef4ea3",
      githubRepo: null,
      openTasks: 2,
      trackedMinutes: 42
    },
    {
      id: "proj_anything_floors",
      name: "Anything Floors and More",
      description: "Operations project",
      projectType: "project",
      status: "production",
      progress: 73,
      coverImageUrl: null,
      initials: "AN",
      accent: "#ef4ea3",
      githubRepo: null,
      openTasks: 3,
      trackedMinutes: 35
    },
    {
      id: "proj_gerald_bathroom",
      name: "Gerald Bathroom project",
      description: "Residential remodel",
      projectType: "dashboard",
      status: "active",
      progress: 26,
      coverImageUrl: null,
      initials: "IN",
      accent: "#f5a623",
      githubRepo: null,
      openTasks: 1,
      trackedMinutes: 16
    }
  ],
  mail: [
    {
      id: "mail-1",
      from: "notifications@github.com",
      to: "sam@inneranimalmedia.com",
      subject: "Settings v2 branch checks",
      preview: "The latest checks completed for feat/settings-v2-localhost-20260926.",
      body: "The latest branch checks completed. Review the generated route tree and package boundary before merge.",
      receivedLabel: "4:42 PM",
      unread: true,
      starred: false
    },
    {
      id: "mail-2",
      from: "client@example.com",
      to: "sam@inneranimalmedia.com",
      subject: "Project assets",
      preview: "I uploaded the new logos and product photos to the shared drive.",
      body: "I uploaded the new logos and product photos to the shared drive. The final approval PDF is attached.",
      receivedLabel: "2:08 PM",
      unread: true,
      starred: true
    },
    {
      id: "mail-3",
      from: "team@inneranimalmedia.com",
      to: "sam@inneranimalmedia.com",
      subject: "Tomorrow's launch desk",
      preview: "Calendar blocks and open tickets have been updated.",
      body: "Calendar blocks and open tickets have been updated. Two P0 tickets still need proof.",
      receivedLabel: "11:31 AM",
      unread: false,
      starred: false
    }
  ],
  calendar: [
    { id: "cal-1", title: "Local Studio review", dayOffset: 1, startMinutes: 10 * 60 + 30, durationMinutes: 60, kind: "meeting" },
    { id: "cal-2", title: "Settings v2 polish", dayOffset: 3, startMinutes: 13 * 60, durationMinutes: 90, kind: "focus" },
    { id: "cal-3", title: "Ticket proof pass", dayOffset: 5, startMinutes: 15 * 60, durationMinutes: 45, kind: "task" }
  ],
  currentProjectId: "proj_companions_cpas_web",
  ticketAnalytics: {
    completionRate: 20,
    avgCycleDays: 3.5,
    oldestActiveDays: 74
  }
};

export function createFixtureWorkHost(
  fixture: WorkSnapshot = populatedWorkFixture,
): WorkHost {
  return {
    async snapshot() {
      return fixture;
    }
  };
}
