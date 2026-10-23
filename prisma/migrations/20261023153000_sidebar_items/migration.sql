CREATE TABLE "sidebar_items" (
    "key" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "href" TEXT,
    "section" VARCHAR(16) NOT NULL DEFAULT 'main',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "sidebar_items_pkey" PRIMARY KEY ("key")
);

INSERT INTO "sidebar_items" ("key", "label", "href", "section", "sortOrder") VALUES
('inicio', 'Início', '/home', 'main', 0),
('administrativo', 'Administrativo', NULL, 'group', 0),
('controle_acesso', 'Controle de Acesso', '/access-control', 'admin', 0);
