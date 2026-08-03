import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";

async function myTeamIds(userId: number): Promise<number[]> {
  const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  return memberships.map((m) => m.teamId);
}

async function loadDashboardWithAccess(id: number, userId: number) {
  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    include: { shares: true },
  });
  if (!dashboard) throw new ApiError(404, "Dashboard not found");

  if (dashboard.ownerId === userId) return { dashboard, isOwner: true, canEdit: true };

  const teamIds = await myTeamIds(userId);
  const share = dashboard.shares.find((s) => s.sharedWithUserId === userId || (s.sharedWithTeamId && teamIds.includes(s.sharedWithTeamId)));
  if (!share) throw new ApiError(403, "You don't have access to this dashboard");
  return { dashboard, isOwner: false, canEdit: share.canEdit };
}

function shapeDashboard(d: { id: number; name: string; module: string; isDefault: boolean; ownerId: number }, isOwner: boolean, canEdit: boolean, ownerName?: string) {
  return { id: d.id, name: d.name, module: d.module, isDefault: d.isDefault, isOwner, canEdit, ownerName };
}

// Every dashboard the caller can see for a module: ones they own, plus ones shared with them
// directly or via a team they belong to.
export async function listDashboards(req: Request, res: Response) {
  const module = String(req.query.module ?? "home");
  const userId = req.user!.id;
  const teamIds = await myTeamIds(userId);

  const [owned, sharedDirect, sharedViaTeam] = await Promise.all([
    prisma.dashboard.findMany({ where: { ownerId: userId, module }, orderBy: { createdAt: "asc" } }),
    prisma.dashboard.findMany({
      where: { module, shares: { some: { sharedWithUserId: userId } } },
      include: { owner: { select: { firstName: true, lastName: true } }, shares: { where: { sharedWithUserId: userId } } },
    }),
    teamIds.length
      ? prisma.dashboard.findMany({
          where: { module, shares: { some: { sharedWithTeamId: { in: teamIds } } } },
          include: { owner: { select: { firstName: true, lastName: true } }, shares: { where: { sharedWithTeamId: { in: teamIds } } } },
        })
      : Promise.resolve([]),
  ]);

  const sharedMap = new Map<number, { dashboard: (typeof sharedDirect)[number]; canEdit: boolean }>();
  for (const d of [...sharedDirect, ...sharedViaTeam]) {
    const canEdit = d.shares.some((s) => s.canEdit);
    const existing = sharedMap.get(d.id);
    sharedMap.set(d.id, { dashboard: d, canEdit: existing ? existing.canEdit || canEdit : canEdit });
  }

  const result = [
    ...owned.map((d) => shapeDashboard(d, true, true)),
    ...[...sharedMap.values()].map(({ dashboard: d, canEdit }) => shapeDashboard(d, false, canEdit, `${d.owner.firstName} ${d.owner.lastName}`)),
  ];
  res.json(result);
}

// Dashboards shared with the caller (directly or via team) for a module — backs the "Shared with
// Me" popup, which is intentionally a narrower view than listDashboards (owned dashboards excluded)
// since its whole purpose is showing what other people gave you access to.
export async function listSharedWithMe(req: Request, res: Response) {
  const module = String(req.query.module ?? "home");
  const userId = req.user!.id;
  const teamIds = await myTeamIds(userId);

  const shared = await prisma.dashboard.findMany({
    where: {
      module,
      ownerId: { not: userId },
      shares: { some: { OR: [{ sharedWithUserId: userId }, ...(teamIds.length ? [{ sharedWithTeamId: { in: teamIds } }] : [])] } },
    },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      shares: { where: { OR: [{ sharedWithUserId: userId }, ...(teamIds.length ? [{ sharedWithTeamId: { in: teamIds } }] : [])] } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.json(
    shared.map((d) => shapeDashboard(d, false, d.shares.some((s) => s.canEdit), `${d.owner.firstName} ${d.owner.lastName}`))
  );
}

// The dashboard that opens by default when the caller visits a module's page — created on first
// visit so every module always has at least one dashboard, matching the old DashboardLayout's
// implicit one-per-(user,module) behavior.
export async function getOrCreateDefault(req: Request, res: Response) {
  const module = String(req.query.module ?? "home");
  const userId = req.user!.id;

  let dashboard = await prisma.dashboard.findFirst({ where: { ownerId: userId, module, isDefault: true } });
  if (!dashboard) {
    dashboard = await prisma.dashboard.create({ data: { name: "Default", module, ownerId: userId, layoutJson: [], isDefault: true } });
  }
  res.json({ ...shapeDashboard(dashboard, true, true), layoutJson: dashboard.layoutJson });
}

export async function createDashboard(req: Request, res: Response) {
  const { name, module, layout } = req.body as { name: string; module: string; layout?: unknown[] };
  const dashboard = await prisma.dashboard.create({
    data: { name, module, ownerId: req.user!.id, layoutJson: (layout ?? []) as any },
  });
  res.status(201).json(shapeDashboard(dashboard, true, true));
}

export async function renameDashboard(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { dashboard, isOwner } = await loadDashboardWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can rename or set the default dashboard");

  const { name, isDefault } = req.body as { name?: string; isDefault?: true };
  if (isDefault) {
    await prisma.dashboard.updateMany({ where: { ownerId: req.user!.id, module: dashboard.module, isDefault: true }, data: { isDefault: false } });
  }
  const updated = await prisma.dashboard.update({
    where: { id },
    data: { ...(name ? { name } : {}), ...(isDefault ? { isDefault: true } : {}) },
  });
  res.json(shapeDashboard(updated, true, true));
}

export async function deleteDashboard(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { dashboard, isOwner } = await loadDashboardWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can delete this dashboard");

  const siblingCount = await prisma.dashboard.count({ where: { ownerId: req.user!.id, module: dashboard.module } });
  if (siblingCount <= 1) throw new ApiError(400, "Can't delete your only dashboard for this module");

  await prisma.dashboard.delete({ where: { id } });

  if (dashboard.isDefault) {
    const next = await prisma.dashboard.findFirst({ where: { ownerId: req.user!.id, module: dashboard.module }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.dashboard.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.json({ ok: true });
}

// Any viewer (owner or shared-with, view or edit) can duplicate a dashboard into their own private,
// fully-editable copy — the original and its shares are untouched.
export async function duplicateDashboard(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { dashboard } = await loadDashboardWithAccess(id, req.user!.id);

  const copy = await prisma.dashboard.create({
    data: {
      name: `${dashboard.name} (Copy)`,
      module: dashboard.module,
      ownerId: req.user!.id,
      layoutJson: dashboard.layoutJson as any,
      isDefault: false,
    },
  });
  res.status(201).json(shapeDashboard(copy, true, true));
}

export async function getLayout(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { dashboard, isOwner, canEdit } = await loadDashboardWithAccess(id, req.user!.id);
  res.json({ id: dashboard.id, name: dashboard.name, module: dashboard.module, layoutJson: dashboard.layoutJson, isOwner, canEdit });
}

export async function putLayout(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { canEdit } = await loadDashboardWithAccess(id, req.user!.id);
  if (!canEdit) throw new ApiError(403, "You don't have edit access to this dashboard");

  await prisma.dashboard.update({ where: { id }, data: { layoutJson: req.body.layout } });
  res.json({ ok: true });
}

export async function listShares(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { isOwner } = await loadDashboardWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can view shares");

  const shares = await prisma.dashboardShare.findMany({
    where: { dashboardId: id },
    include: { sharedWithUser: { select: { firstName: true, lastName: true, email: true } }, sharedWithTeam: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    shares.map((s) => ({
      id: s.id,
      canEdit: s.canEdit,
      userName: s.sharedWithUser ? `${s.sharedWithUser.firstName} ${s.sharedWithUser.lastName}` : null,
      userEmail: s.sharedWithUser?.email ?? null,
      teamName: s.sharedWithTeam?.name ?? null,
    }))
  );
}

export async function createShare(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { isOwner } = await loadDashboardWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can share this dashboard");

  const { userId, teamId, canEdit } = req.body as { userId?: number; teamId?: number; canEdit: boolean };
  const share = await prisma.dashboardShare.upsert({
    where: userId
      ? { dashboardId_sharedWithUserId: { dashboardId: id, sharedWithUserId: userId } }
      : { dashboardId_sharedWithTeamId: { dashboardId: id, sharedWithTeamId: teamId! } },
    update: { canEdit },
    create: { dashboardId: id, sharedWithUserId: userId, sharedWithTeamId: teamId, canEdit },
  });
  res.status(201).json({ id: share.id, canEdit: share.canEdit });
}

export async function deleteShare(req: Request, res: Response) {
  const id = Number(req.params.id);
  const shareId = Number(req.params.shareId);
  const { isOwner } = await loadDashboardWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can remove a share");

  await prisma.dashboardShare.delete({ where: { id: shareId } });
  res.json({ ok: true });
}
