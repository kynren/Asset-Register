import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";

async function myTeamIds(userId: number): Promise<number[]> {
  const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  return memberships.map((m) => m.teamId);
}

async function loadSavedViewWithAccess(id: number, userId: number) {
  const savedView = await prisma.savedView.findUnique({ where: { id }, include: { shares: true } });
  if (!savedView) throw new ApiError(404, "Saved view not found");

  if (savedView.ownerId === userId) return { savedView, isOwner: true, canEdit: true };

  const teamIds = await myTeamIds(userId);
  const share = savedView.shares.find((s) => s.sharedWithUserId === userId || (s.sharedWithTeamId && teamIds.includes(s.sharedWithTeamId)));
  if (!share) throw new ApiError(403, "You don't have access to this saved view");
  return { savedView, isOwner: false, canEdit: share.canEdit };
}

function shapeSavedView(v: { id: number; name: string; tableId: string; isDefault: boolean; ownerId: number }, isOwner: boolean, canEdit: boolean, ownerName?: string) {
  return { id: v.id, name: v.name, tableId: v.tableId, isDefault: v.isDefault, isOwner, canEdit, ownerName };
}

// Every saved view the caller can see for a table: ones they own, plus ones shared with them
// directly or via a team they belong to.
export async function listSavedViews(req: Request, res: Response) {
  const tableId = String(req.query.tableId ?? "");
  if (!tableId) throw new ApiError(400, "tableId is required");
  const userId = req.user!.id;
  const teamIds = await myTeamIds(userId);

  const [owned, sharedDirect, sharedViaTeam] = await Promise.all([
    prisma.savedView.findMany({ where: { ownerId: userId, tableId }, orderBy: { createdAt: "asc" } }),
    prisma.savedView.findMany({
      where: { tableId, shares: { some: { sharedWithUserId: userId } } },
      include: { owner: { select: { firstName: true, lastName: true } }, shares: { where: { sharedWithUserId: userId } } },
    }),
    teamIds.length
      ? prisma.savedView.findMany({
          where: { tableId, shares: { some: { sharedWithTeamId: { in: teamIds } } } },
          include: { owner: { select: { firstName: true, lastName: true } }, shares: { where: { sharedWithTeamId: { in: teamIds } } } },
        })
      : Promise.resolve([]),
  ]);

  const sharedMap = new Map<number, { savedView: (typeof sharedDirect)[number]; canEdit: boolean }>();
  for (const v of [...sharedDirect, ...sharedViaTeam]) {
    const canEdit = v.shares.some((s) => s.canEdit);
    const existing = sharedMap.get(v.id);
    sharedMap.set(v.id, { savedView: v, canEdit: existing ? existing.canEdit || canEdit : canEdit });
  }

  const result = [
    ...owned.map((v) => shapeSavedView(v, true, true)),
    ...[...sharedMap.values()].map(({ savedView: v, canEdit }) => shapeSavedView(v, false, canEdit, `${v.owner.firstName} ${v.owner.lastName}`)),
  ];
  res.json(result);
}

// Saved views shared with the caller (directly or via team) for a table — backs the "Shared with
// Me" popup, narrower than listSavedViews since it excludes views the caller owns.
export async function listSharedWithMe(req: Request, res: Response) {
  const tableId = String(req.query.tableId ?? "");
  if (!tableId) throw new ApiError(400, "tableId is required");
  const userId = req.user!.id;
  const teamIds = await myTeamIds(userId);

  const shared = await prisma.savedView.findMany({
    where: {
      tableId,
      ownerId: { not: userId },
      shares: { some: { OR: [{ sharedWithUserId: userId }, ...(teamIds.length ? [{ sharedWithTeamId: { in: teamIds } }] : [])] } },
    },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      shares: { where: { OR: [{ sharedWithUserId: userId }, ...(teamIds.length ? [{ sharedWithTeamId: { in: teamIds } }] : [])] } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.json(shared.map((v) => shapeSavedView(v, false, v.shares.some((s) => s.canEdit), `${v.owner.firstName} ${v.owner.lastName}`)));
}

export async function getDefault(req: Request, res: Response) {
  const tableId = String(req.query.tableId ?? "");
  if (!tableId) throw new ApiError(400, "tableId is required");
  const userId = req.user!.id;

  const savedView = await prisma.savedView.findFirst({ where: { ownerId: userId, tableId, isDefault: true } });
  if (!savedView) return res.json(null);
  res.json({ ...shapeSavedView(savedView, true, true), filters: savedView.filters });
}

export async function createSavedView(req: Request, res: Response) {
  const { name, tableId, filters } = req.body as { name: string; tableId: string; filters: unknown };
  const savedView = await prisma.savedView.create({
    data: { name, tableId, ownerId: req.user!.id, filters: filters as any },
  });
  res.status(201).json(shapeSavedView(savedView, true, true));
}

export async function renameSavedView(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { savedView, isOwner } = await loadSavedViewWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can rename or set the default saved view");

  const { name, isDefault } = req.body as { name?: string; isDefault?: true };
  if (isDefault) {
    await prisma.savedView.updateMany({ where: { ownerId: req.user!.id, tableId: savedView.tableId, isDefault: true }, data: { isDefault: false } });
  }
  const updated = await prisma.savedView.update({
    where: { id },
    data: { ...(name ? { name } : {}), ...(isDefault ? { isDefault: true } : {}) },
  });
  res.json(shapeSavedView(updated, true, true));
}

export async function deleteSavedView(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { isOwner } = await loadSavedViewWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can delete this saved view");

  await prisma.savedView.delete({ where: { id } });
  res.json({ ok: true });
}

// Any viewer (owner or shared-with, view or edit) can duplicate a saved view into their own
// private, fully-editable copy — the original and its shares are untouched.
export async function duplicateSavedView(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { savedView } = await loadSavedViewWithAccess(id, req.user!.id);

  const copy = await prisma.savedView.create({
    data: {
      name: `${savedView.name} (Copy)`,
      tableId: savedView.tableId,
      ownerId: req.user!.id,
      filters: savedView.filters as any,
      isDefault: false,
    },
  });
  res.status(201).json(shapeSavedView(copy, true, true));
}

export async function getFilters(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { savedView, isOwner, canEdit } = await loadSavedViewWithAccess(id, req.user!.id);
  res.json({ id: savedView.id, name: savedView.name, tableId: savedView.tableId, filters: savedView.filters, isOwner, canEdit });
}

export async function putFilters(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { canEdit } = await loadSavedViewWithAccess(id, req.user!.id);
  if (!canEdit) throw new ApiError(403, "You don't have edit access to this saved view");

  await prisma.savedView.update({ where: { id }, data: { filters: req.body.filters } });
  res.json({ ok: true });
}

export async function listShares(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { isOwner } = await loadSavedViewWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can view shares");

  const shares = await prisma.savedViewShare.findMany({
    where: { savedViewId: id },
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
  const { isOwner } = await loadSavedViewWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can share this saved view");

  const { userId, teamId, canEdit } = req.body as { userId?: number; teamId?: number; canEdit: boolean };
  const share = await prisma.savedViewShare.upsert({
    where: userId
      ? { savedViewId_sharedWithUserId: { savedViewId: id, sharedWithUserId: userId } }
      : { savedViewId_sharedWithTeamId: { savedViewId: id, sharedWithTeamId: teamId! } },
    update: { canEdit },
    create: { savedViewId: id, sharedWithUserId: userId, sharedWithTeamId: teamId, canEdit },
  });
  res.status(201).json({ id: share.id, canEdit: share.canEdit });
}

export async function deleteShare(req: Request, res: Response) {
  const id = Number(req.params.id);
  const shareId = Number(req.params.shareId);
  const { isOwner } = await loadSavedViewWithAccess(id, req.user!.id);
  if (!isOwner) throw new ApiError(403, "Only the owner can remove a share");

  await prisma.savedViewShare.delete({ where: { id: shareId } });
  res.json({ ok: true });
}
