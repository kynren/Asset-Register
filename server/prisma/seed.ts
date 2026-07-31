import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { MODULES } from "../src/constants/modules";
import { generateApiKey, generateTempPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

type PermSet = Partial<Record<(typeof MODULES)[number], { canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; canExport?: boolean }>>;

const ALL_TRUE = { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true };
const VIEW_ONLY = { canView: true, canCreate: false, canEdit: false, canDelete: false, canExport: false };

const ROLE_DEFS: { name: string; description: string; isSystem: boolean; perms: PermSet }[] = [
  {
    name: "Super Admin",
    description: "Full access to every module, including system administration.",
    isSystem: true,
    perms: Object.fromEntries(MODULES.map((m) => [m, ALL_TRUE])) as PermSet,
  },
  {
    name: "Admin",
    description: "Full operational access; cannot be prevented by permissions from managing the system.",
    isSystem: true,
    perms: Object.fromEntries(MODULES.map((m) => [m, ALL_TRUE])) as PermSet,
  },
  {
    name: "IT Technician",
    description: "Manages assets, devices, network map, NVRs and operations tools.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: ALL_TRUE,
      network: ALL_TRUE,
      stock: VIEW_ONLY,
      helpdesk: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true },
      operations: ALL_TRUE,
      nvr: ALL_TRUE,
      "access-control": ALL_TRUE,
      lighting: ALL_TRUE,
      "virtual-assistant": VIEW_ONLY,
      docs: ALL_TRUE,
      admin: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
    },
  },
  {
    name: "Helpdesk Agent",
    description: "Manages tickets end-to-end; view-only on assets.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: VIEW_ONLY,
      network: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      stock: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      helpdesk: ALL_TRUE,
      operations: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      nvr: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      "access-control": { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      lighting: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      "virtual-assistant": VIEW_ONLY,
      docs: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: false },
      admin: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
    },
  },
  {
    name: "Stock Manager",
    description: "Manages stock register and analytics; view-only on assets and dashboard.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: VIEW_ONLY,
      network: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      stock: ALL_TRUE,
      helpdesk: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      operations: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      nvr: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      "access-control": { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      lighting: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      "virtual-assistant": VIEW_ONLY,
      docs: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: false },
      admin: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
    },
  },
  {
    name: "Viewer",
    description: "Read-only access across the operational modules.",
    isSystem: true,
    perms: {
      dashboard: VIEW_ONLY,
      assets: VIEW_ONLY,
      network: VIEW_ONLY,
      stock: VIEW_ONLY,
      helpdesk: VIEW_ONLY,
      operations: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      nvr: VIEW_ONLY,
      "access-control": VIEW_ONLY,
      lighting: VIEW_ONLY,
      "virtual-assistant": VIEW_ONLY,
      docs: VIEW_ONLY,
      admin: { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
    },
  },
];

async function main() {
  console.log("Seeding roles and permissions...");
  for (const def of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { description: def.description, isSystem: def.isSystem },
      create: { name: def.name, description: def.description, isSystem: def.isSystem },
    });

    for (const module of MODULES) {
      const p = def.perms[module] ?? { canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false };
      await prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: role.id, module } },
        update: p,
        create: { roleId: role.id, module, ...p },
      });
    }
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "Super Admin" } });

  const adminEmail = "subscriptions@kynren.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  let tempPassword: string | null = null;

  if (!existingAdmin) {
    tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        firstName: "Kynren",
        lastName: "Admin",
        roleId: superAdminRole.id,
        passwordHash,
        mustChangePassword: true,
      },
    });
    console.log(`Created default admin user: ${adminEmail}`);
  }

  console.log("Seeding asset categories...");
  const categories = ["Laptop", "Desktop", "Monitor", "Printer", "Networking Equipment", "Mobile Device", "Server"];
  for (const name of categories) {
    await prisma.assetCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log("Seeding locations...");
  const locations = [
    { name: "Kynren Head Office", address: "Bishop Auckland, County Durham, UK" },
    { name: "Kynren Warehouse", address: "" },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({ where: { name: loc.name }, update: {}, create: loc });
  }

  console.log("Seeding system settings...");
  const settings: Record<string, string> = {
    companyName: "Kynren",
    passwordMinLength: "10",
    deviceOfflineThresholdMinutes: "15",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log("Seeding agent API key...");
  const existingKey = await prisma.agentApiKey.findFirst({ where: { label: "Default" } });
  let agentKey: string | null = null;
  if (!existingKey) {
    agentKey = generateApiKey();
    await prisma.agentApiKey.create({ data: { key: agentKey, label: "Default" } });
  }

  console.log("\n===================== SEED COMPLETE =====================");
  if (tempPassword) {
    console.log(`Default admin login: ${adminEmail}`);
    console.log(`Temporary password:  ${tempPassword}`);
    console.log("You will be required to change this password on first login.");
  } else {
    console.log("Default admin user already existed; password unchanged.");
  }
  if (agentKey) {
    console.log(`\nAgent API key (put this in agent/.env as AGENT_API_KEY):\n${agentKey}`);
  }
  console.log("===========================================================\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
