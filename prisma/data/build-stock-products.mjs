// Gera stock-products.json a partir do relatório exportado do eugestor (linhas) + captura do console (locais/unidades).
import fs from "fs";
const [rowsPath, savedPath, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(rowsPath, "utf8")).slice(1);
const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
const locs = new Map(), unitNames = {};
for (const x of saved) {
  const l = x.detail ?? [], k = l.indexOf("Produto:");
  if (l[k + 1] !== x.row[0]) continue;
  const u = l[l.indexOf("Unidade de medida:") + 1]?.split(" - ");
  if (u?.[1]) unitNames[u[0]] = u[1];
  const from = l.indexOf("Saldo por local de estoque.") + 1, to = l.indexOf("Saldo atual");
  locs.set(x.row[0], l.slice(from, to));
}
const num = (v) => (v === undefined || v === "" ? null : Number(v));
const products = rows.map((r) => ({
  legacyId: Number(r.A), description: r.B, brand: r.D || "Geral", model: r.E || null, productGroup: r.F || "Geral",
  unit: r.G, unitName: unitNames[r.G] ?? null, quantity: num(r.H) ?? 0, costPrice: num(r.I), salePrice: num(r.J),
  isActive: r.K === "Ativo", locations: locs.get(r.B) ?? null,
}));
fs.writeFileSync(out, JSON.stringify(products, null, 1));
console.log(products.length, "produtos; unidades:", unitNames, "sem local conhecido:", products.filter((p) => !p.locations).length, "multi-local:", products.filter((p) => p.locations?.length > 1).map((p) => p.description));
