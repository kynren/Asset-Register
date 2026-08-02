import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { generateApiKey, generateTempPassword } from "../src/lib/passwords";
import { seedRoles } from "../src/lib/seedRoles";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding roles and permissions...");
  await seedRoles(prisma);

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
