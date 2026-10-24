// Importação pontual dos produtos/saldos do eugestor (dados em prisma/data/stock-products.json). Idempotente.
import fs from "fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const data = JSON.parse(fs.readFileSync(new URL("./data/stock-products.json", import.meta.url), "utf8"));
const locations = new Map((await prisma.stockLocation.findMany()).map((l) => [l.description, l.id]));
const central = locations.get("Central");
let n = 0;
for (const p of data) {
  const { locations: locs, quantity, legacyId, ...fields } = p;
  const product = await prisma.stockProduct.upsert({ where: { legacyId }, create: { legacyId, ...fields }, update: fields });
  const locationId = locations.get(locs?.[0]) ?? central;
  await prisma.stockProductBalance.deleteMany({ where: { productId: product.id } });
  await prisma.stockProductBalance.create({ data: { productId: product.id, locationId, quantity } });
  n++;
}
console.log("importados:", n);
await prisma.$disconnect();
