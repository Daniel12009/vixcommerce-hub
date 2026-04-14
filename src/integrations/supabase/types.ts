export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_data: {
        Row: {
          created_at: string | null
          data_key: string
          data_value: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_key: string
          data_value?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_key?: string
          data_value?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      envios_full: {
        Row: {
          caixas: number | null
          coletado: boolean | null
          conta: string | null
          created_at: string | null
          data_coleta: string | null
          data_inicio: string | null
          envio_numero: string | null
          id: string
          local: string | null
          preparado: boolean | null
          updated_at: string | null
        }
        Insert: {
          caixas?: number | null
          coletado?: boolean | null
          conta?: string | null
          created_at?: string | null
          data_coleta?: string | null
          data_inicio?: string | null
          envio_numero?: string | null
          id?: string
          local?: string | null
          preparado?: boolean | null
          updated_at?: string | null
        }
        Update: {
          caixas?: number | null
          coletado?: boolean | null
          conta?: string | null
          created_at?: string | null
          data_coleta?: string | null
          data_inicio?: string | null
          envio_numero?: string | null
          id?: string
          local?: string | null
          preparado?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      envios_full_items: {
        Row: {
          envio_id: string
          id: string
          quantidade: number | null
          sku: string
        }
        Insert: {
          envio_id: string
          id?: string
          quantidade?: number | null
          sku: string
        }
        Update: {
          envio_id?: string
          id?: string
          quantidade?: number | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "envios_full_items_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios_full"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_items: {
        Row: {
          conta: string
          created_at: string
          dias_cobertura: number
          em_transferencia: number
          em_transito: number
          estoque_atual: number
          estoque_minimo: number
          extra_fields: Json | null
          id: string
          lead_time: number
          necessidade_reposicao: number
          nome: string
          sku_principal: string
          status_cobertura: string
          vmd: number
        }
        Insert: {
          conta?: string
          created_at?: string
          dias_cobertura?: number
          em_transferencia?: number
          em_transito?: number
          estoque_atual?: number
          estoque_minimo?: number
          extra_fields?: Json | null
          id?: string
          lead_time?: number
          necessidade_reposicao?: number
          nome?: string
          sku_principal: string
          status_cobertura?: string
          vmd?: number
        }
        Update: {
          conta?: string
          created_at?: string
          dias_cobertura?: number
          em_transferencia?: number
          em_transito?: number
          estoque_atual?: number
          estoque_minimo?: number
          extra_fields?: Json | null
          id?: string
          lead_time?: number
          necessidade_reposicao?: number
          nome?: string
          sku_principal?: string
          status_cobertura?: string
          vmd?: number
        }
        Relationships: []
      }
      financeiro_items: {
        Row: {
          created_at: string
          custo: number
          extra_fields: Json | null
          frete: number
          id: string
          impostos: number
          margem_percent: number
          margem_real: number
          nome: string
          receita: number
          sku_principal: string
          taxas: number
          unidades_vendidas: number
        }
        Insert: {
          created_at?: string
          custo?: number
          extra_fields?: Json | null
          frete?: number
          id?: string
          impostos?: number
          margem_percent?: number
          margem_real?: number
          nome?: string
          receita?: number
          sku_principal: string
          taxas?: number
          unidades_vendidas?: number
        }
        Update: {
          created_at?: string
          custo?: number
          extra_fields?: Json | null
          frete?: number
          id?: string
          impostos?: number
          margem_percent?: number
          margem_real?: number
          nome?: string
          receita?: number
          sku_principal?: string
          taxas?: number
          unidades_vendidas?: number
        }
        Relationships: []
      }
      ml_accounts: {
        Row: {
          access_token: string
          ativo: boolean
          client_id: string
          client_secret: string
          created_at: string
          id: string
          nome: string
          refresh_token: string
          seller_id: string | null
          token_expires_at: string | null
        }
        Insert: {
          access_token?: string
          ativo?: boolean
          client_id?: string
          client_secret?: string
          created_at?: string
          id?: string
          nome?: string
          refresh_token?: string
          seller_id?: string | null
          token_expires_at?: string | null
        }
        Update: {
          access_token?: string
          ativo?: boolean
          client_id?: string
          client_secret?: string
          created_at?: string
          id?: string
          nome?: string
          refresh_token?: string
          seller_id?: string | null
          token_expires_at?: string | null
        }
        Relationships: []
      }
      ml_answer_templates: {
        Row: {
          active: boolean
          answer_text: string
          created_at: string
          id: string
          keywords: string[]
          seller_id: string
          title: string
          updated_at: string
          use_count: number
        }
        Insert: {
          active?: boolean
          answer_text?: string
          created_at?: string
          id?: string
          keywords?: string[]
          seller_id: string
          title?: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          active?: boolean
          answer_text?: string
          created_at?: string
          id?: string
          keywords?: string[]
          seller_id?: string
          title?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      performance_items: {
        Row: {
          canceladas: number
          conta: string
          conversao: number
          created_at: string
          data_ref: string
          id: string
          id_anuncio: string
          link: string
          plataforma: string
          preco: number
          sku: string
          titulo: string
          vendas: number
          visitas: number
        }
        Insert: {
          canceladas?: number
          conta?: string
          conversao?: number
          created_at?: string
          data_ref?: string
          id?: string
          id_anuncio?: string
          link?: string
          plataforma?: string
          preco?: number
          sku?: string
          titulo?: string
          vendas?: number
          visitas?: number
        }
        Update: {
          canceladas?: number
          conta?: string
          conversao?: number
          created_at?: string
          data_ref?: string
          id?: string
          id_anuncio?: string
          link?: string
          plataforma?: string
          preco?: number
          sku?: string
          titulo?: string
          vendas?: number
          visitas?: number
        }
        Relationships: []
      }
      sheet_configs: {
        Row: {
          aba_nome: string
          created_at: string
          id: string
          linha_inicial: number
          mapeamento: Json
          modulo_destino: string
          nome: string
          spreadsheet_id: string
          ultima_sync: string | null
          updated_at: string
          url: string
          valores_fixos: Json | null
        }
        Insert: {
          aba_nome: string
          created_at?: string
          id: string
          linha_inicial?: number
          mapeamento?: Json
          modulo_destino: string
          nome: string
          spreadsheet_id: string
          ultima_sync?: string | null
          updated_at?: string
          url: string
          valores_fixos?: Json | null
        }
        Update: {
          aba_nome?: string
          created_at?: string
          id?: string
          linha_inicial?: number
          mapeamento?: Json
          modulo_destino?: string
          nome?: string
          spreadsheet_id?: string
          ultima_sync?: string | null
          updated_at?: string
          url?: string
          valores_fixos?: Json | null
        }
        Relationships: []
      }
      sync_checkpoints: {
        Row: {
          key: string
          last_sync_at: string | null
          last_sync_date: string
          total_records: number | null
        }
        Insert: {
          key: string
          last_sync_at?: string | null
          last_sync_date: string
          total_records?: number | null
        }
        Update: {
          key?: string
          last_sync_at?: string | null
          last_sync_date?: string
          total_records?: number | null
        }
        Relationships: []
      }
      sync_run_log: {
        Row: {
          finished_at: string | null
          id: string
          message: string | null
          module: string
          run_date: string
          started_at: string
          status: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          message?: string | null
          module: string
          run_date?: string
          started_at?: string
          status?: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          message?: string | null
          module?: string
          run_date?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      vendas_cache: {
        Row: {
          conta: string | null
          created_at: string | null
          data: string | null
          id: string
          payload: Json | null
          sku: string | null
          valor_total: number | null
        }
        Insert: {
          conta?: string | null
          created_at?: string | null
          data?: string | null
          id: string
          payload?: Json | null
          sku?: string | null
          valor_total?: number | null
        }
        Update: {
          conta?: string | null
          created_at?: string | null
          data?: string | null
          id?: string
          payload?: Json | null
          sku?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      vendas_items: {
        Row: {
          ads: number
          cmv: number
          comissao: number
          comprador: string
          conta: string
          conta_mae: string
          created_at: string
          custo_envio: number
          data: string
          devolucao: number
          extra_fields: Json | null
          frete: number
          id: string
          impostos: number
          liquido: number
          margem: string
          numero_pedido: string
          origem: string
          pedido_origem: string
          preco_unitario: number
          produto: string
          quantidade: number
          sku: string
          sku_produto: string
          status_pedido: string
          valor_total: number
        }
        Insert: {
          ads?: number
          cmv?: number
          comissao?: number
          comprador?: string
          conta?: string
          conta_mae?: string
          created_at?: string
          custo_envio?: number
          data?: string
          devolucao?: number
          extra_fields?: Json | null
          frete?: number
          id?: string
          impostos?: number
          liquido?: number
          margem?: string
          numero_pedido?: string
          origem?: string
          pedido_origem?: string
          preco_unitario?: number
          produto?: string
          quantidade?: number
          sku?: string
          sku_produto?: string
          status_pedido?: string
          valor_total?: number
        }
        Update: {
          ads?: number
          cmv?: number
          comissao?: number
          comprador?: string
          conta?: string
          conta_mae?: string
          created_at?: string
          custo_envio?: number
          data?: string
          devolucao?: number
          extra_fields?: Json | null
          frete?: number
          id?: string
          impostos?: number
          liquido?: number
          margem?: string
          numero_pedido?: string
          origem?: string
          pedido_origem?: string
          preco_unitario?: number
          produto?: string
          quantidade?: number
          sku?: string
          sku_produto?: string
          status_pedido?: string
          valor_total?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cron_jobs: {
        Args: never
        Returns: {
          command: string
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      schedule_cron_job: {
        Args: {
          cron_expression: string
          function_name: string
          job_name: string
          request_body?: string
        }
        Returns: number
      }
      unschedule_cron_job: { Args: { job_name: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
