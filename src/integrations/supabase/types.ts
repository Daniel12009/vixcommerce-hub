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
      [_ in never]: never
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
