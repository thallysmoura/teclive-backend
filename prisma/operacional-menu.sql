-- Menu Operacional (grupo + 9 subitens). Idempotente: só insere o que ainda não existe.
update sidebar_items set "sortOrder" = 5 where key = 'item_0e395fd2-9b50-42be-9cc3-c0ae32fe4ec0' and "sortOrder" = 4;
insert into sidebar_items (key, label, href, section, "sortOrder", "parentKey")
select 'item_' || gen_random_uuid(), 'Operacional', '/items/operacional', 'main', 4, null
where not exists (select 1 from sidebar_items where href = '/items/operacional');
insert into sidebar_items (key, label, href, section, "sortOrder", "parentKey")
select 'item_' || gen_random_uuid(), v.label, v.href, 'main', v.ord, (select key from sidebar_items where href = '/items/operacional')
from (values
  ('Andamento do Operacional', '/operacional/andamento', 40), ('Ordens de Serviço', '/operacional/ordens-servico', 41), ('Gestão de OS', '/operacional/gestao', 42),
  ('Causas', '/operacional/causas', 43), ('Defeitos', '/operacional/defeitos', 44), ('Soluções', '/operacional/solucoes', 45),
  ('Agenda Técnica', '/operacional/agenda', 46), ('Central de Operações', '/operacional/central', 47), ('Questionários', '/operacional/questionarios', 48)
) as v(label, href, ord)
where not exists (select 1 from sidebar_items s where s.href = v.href);
select key, label, href from sidebar_items where href like '/operacional/%' or href = '/items/operacional' order by "sortOrder";
