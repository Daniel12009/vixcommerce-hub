-- Monitor de Mercado — Market Intelligence tables
-- Migration 008: market_segments, market_snapshots, market_sellers, seller_snapshots

-- ─── market_sellers ───────────────────────────────────────────────────────────
create table if not exists market_sellers (
  id uuid primary key default gen_random_uuid(),
  seller_id text not null,
  nickname text,
  nome_interno text,
  is_minha_conta boolean default false,
  cor text default '#6366f1',
  ativo boolean default true,
  criado_em timestamptz default now()
);

create unique index if not exists market_sellers_seller_id_idx on market_sellers(seller_id);

-- ─── market_segments ──────────────────────────────────────────────────────────
create table if not exists market_segments (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('categoria','keyword')),
  category_id text,
  keyword text,
  top_n int default 50,
  ativo boolean default true,
  criado_em timestamptz default now()
);

-- ─── market_snapshots ─────────────────────────────────────────────────────────
create table if not exists market_snapshots (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid references market_segments(id) on delete cascade,
  item_id text,
  seller_id text,
  seller_nick text,
  titulo text,
  posicao int,
  preco numeric,
  vendas_estimadas int,
  free_shipping boolean,
  listing_type text,
  coletado_em timestamptz default now()
);

create index if not exists market_snapshots_segment_id_idx on market_snapshots(segment_id);
create index if not exists market_snapshots_coletado_em_idx on market_snapshots(coletado_em);
create index if not exists market_snapshots_seller_id_idx on market_snapshots(seller_id);

-- ─── seller_snapshots ─────────────────────────────────────────────────────────
create table if not exists seller_snapshots (
  id uuid primary key default gen_random_uuid(),
  seller_id_ref uuid references market_sellers(id) on delete cascade,
  reputacao text,
  nivel text,
  total_itens int,
  health_score numeric,
  transactions_total int,
  negative_rating numeric,
  coletado_em timestamptz default now()
);

create index if not exists seller_snapshots_seller_id_ref_idx on seller_snapshots(seller_id_ref);

-- ─── RLS: allow service role full access ──────────────────────────────────────
alter table market_sellers enable row level security;
alter table market_segments enable row level security;
alter table market_snapshots enable row level security;
alter table seller_snapshots enable row level security;

create policy "service_role_all_market_sellers" on market_sellers for all using (true) with check (true);
create policy "service_role_all_market_segments" on market_segments for all using (true) with check (true);
create policy "service_role_all_market_snapshots" on market_snapshots for all using (true) with check (true);
create policy "service_role_all_seller_snapshots" on seller_snapshots for all using (true) with check (true);

-- ─── Seeds: categorias pré-configuradas ───────────────────────────────────────
insert into market_segments (nome, tipo, category_id, keyword, top_n, ativo) values
  ('Luminárias Pendentes',         'keyword', 'MLB1574', 'luminaria pendente cozinha',          50, true),
  ('Escorredores de Louça',        'keyword', 'MLB1574', 'escorredor louca inox',               30, true),
  ('Torneiras — Banheiro',         'keyword', 'MLB1500', 'torneira banheiro monocomando',       50, true),
  ('Torneiras — Cozinha',          'keyword', 'MLB1500', 'torneira cozinha gourmet',            50, true),
  ('Cubas — Banheiro e Cozinha',   'keyword', 'MLB1574', 'cuba inox sobrepor',                  50, true),
  ('Acabamentos de Registro',      'keyword', 'MLB1500', 'acabamento registro redondo',         30, true),
  ('Chuveiro a Gás',               'keyword', 'MLB1500', 'chuveiro gas passagem',               30, true),
  ('Barra de Apoio',               'keyword', 'MLB1500', 'barra apoio banheiro inox',           30, true)
on conflict do nothing;

-- ─── Seeds: segmentos de nicho (keyword mais granulares) ──────────────────────
insert into market_segments (nome, tipo, category_id, keyword, top_n, ativo) values
  ('Torneira Preta Bica Baixa',          'keyword', 'MLB1500', 'torneira preta bica baixa',                    50, true),
  ('Torneira Gourmet Monocomando',       'keyword', 'MLB1500', 'torneira gourmet monocomando',                 50, true),
  ('Cuba Sobrepor Retangular',           'keyword', 'MLB1574', 'cuba sobrepor retangular inox',                50, true),
  ('Luminária Pendente Industrial',      'keyword', 'MLB1574', 'luminaria pendente industrial cozinha',        50, true),
  ('Barra Apoio Inox 80cm',              'keyword', 'MLB1500', 'barra apoio banheiro inox 80cm',               30, true),
  ('Escorredor Louça Inox Parede',       'keyword', 'MLB1574', 'escorredor louca inox parede suspenso',        30, true)
on conflict do nothing;
