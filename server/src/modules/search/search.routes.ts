import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { hasPermission } from "../../middleware/rbac";

const router = Router();
router.use(verifyJwt);

const RESULTS_PER_GROUP = 5;

// A single global lookup covering the handful of entities the topbar search box already
// advertises ("assets, tickets, knowledge") rather than only ever searching assets. Each group
// is independently permission-gated so a user without e.g. helpdesk view access never sees
// ticket titles/descriptions leak through a shared search box.
router.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) return res.json({ assets: [], tickets: [], docs: [] });

  const roleId = req.user!.roleId;
  const [canAssets, canTickets, canDocs] = await Promise.all([
    hasPermission(roleId, "assets", "view"),
    hasPermission(roleId, "helpdesk", "view"),
    hasPermission(roleId, "docs", "view"),
  ]);

  const [assets, tickets, docs] = await Promise.all([
    canAssets
      ? prisma.asset.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { assetTag: { contains: q, mode: "insensitive" } },
              { serialNumber: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, assetTag: true, name: true },
          take: RESULTS_PER_GROUP,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    canTickets
      ? prisma.ticket.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { ticketNumber: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, ticketNumber: true, title: true, status: true },
          take: RESULTS_PER_GROUP,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    canDocs
      ? prisma.$queryRaw<{ id: number; title: string; docType: string }[]>(Prisma.sql`
          SELECT id, title, "docType"
          FROM "Document"
          WHERE to_tsvector('english', "searchText") @@ websearch_to_tsquery('english', ${q})
          ORDER BY ts_rank_cd(to_tsvector('english', "searchText"), websearch_to_tsquery('english', ${q})) DESC
          LIMIT ${RESULTS_PER_GROUP}
        `)
      : Promise.resolve([]),
  ]);

  res.json({
    assets: assets.map((a) => ({ type: "asset", id: a.id, path: `/assets/${a.id}`, label: a.name, sublabel: a.assetTag })),
    tickets: tickets.map((t) => ({ type: "ticket", id: t.id, path: `/helpdesk/${t.id}`, label: t.title, sublabel: `${t.ticketNumber} · ${t.status.replace("_", " ")}` })),
    docs: docs.map((d) => ({ type: "doc", id: d.id, path: `/docs/${d.id}`, label: d.title, sublabel: d.docType.replace(/_/g, " ") })),
  });
});

export default router;
