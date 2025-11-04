// scripts/create-admin.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = 'dev';
  const email = 'dev@local';
  const plain = 'dev';

  const passwordHash = await bcrypt.hash(plain, 12);

  const user = await prisma.user.upsert({
    where: { email },                // E-Mail ist unique → ideal fürs upsert
    update: {
      username,
      passwordHash,
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      deletedAt: null,               // falls mal deaktiviert war → wieder aktivieren
    },
    create: {
      username,
      email,
      passwordHash,
      role: 'ADMIN',
      emailVerifiedAt: new Date(),   // direkt verifiziert
    },
  });

  console.log('✅ Admin bereit:', { id: user.id, username: user.username, email: user.email, role: user.role });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
