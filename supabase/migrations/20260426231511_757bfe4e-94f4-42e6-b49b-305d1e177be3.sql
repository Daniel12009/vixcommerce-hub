NOTIFY pgrst, 'reload schema';
COMMENT ON TABLE public.daily_sales_snapshots IS 'Snapshots diários de vendas por hora — usado no comparativo "ontem vs hoje" do Dashboard.';
NOTIFY pgrst, 'reload schema';