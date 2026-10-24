-- Item "Gestão de Obras" logo abaixo de "Visão Geral". A chave do item é também a permissão (aparece em Equipe e Permissões).
-- Idempotente: só insere se ainda não existir.
update sidebar_items set "sortOrder" = "sortOrder" + 1
where section = 'main' and "parentKey" is null and "sortOrder" >= 1
  and not exists (select 1 from sidebar_items where href = '/gestao-obras');
insert into sidebar_items (key, label, href, section, "sortOrder", "parentKey")
select 'item_9afd38a1-893b-4107-a3ba-62012a229679', 'Gestão de Obras', '/gestao-obras', 'main', 1, null
where not exists (select 1 from sidebar_items where href = '/gestao-obras');
select label, "sortOrder" from sidebar_items where section = 'main' and "parentKey" is null order by "sortOrder", key;
