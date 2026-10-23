INSERT INTO "company_profile" (
  "id", "cnpj", "legalName", "tradeName", "email", "phone",
  "postalCode", "street", "number", "district", "complement", "city", "state",
  "municipalRegistration", "stateRegistration", "taxRegime", "cnae", "updatedAt"
) VALUES (
  'main', '27037655000190', 'Teclive Servicos em Tecnologia LTDA', 'Teclive Servicos em Tecnologia',
  'nf@teclivetecnologia.com.br', '9295091196',
  '69044110', 'R Francisco Nobre', '25', 'Planalto', 'Qd 26 a Conjunto be', 'Manaus', 'AM',
  '23204001', '05.404.297-6', 'SIMPLES_NACIONAL', '4321500', CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
