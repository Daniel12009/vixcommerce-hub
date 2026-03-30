import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, xml_content, filename, summary } = await req.json();

    if (!to || !xml_content) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'xml_content'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert XML string to base64 for attachment
    const encoder = new TextEncoder();
    const xmlBytes = encoder.encode(xml_content);
    const base64Content = btoa(String.fromCharCode(...xmlBytes));

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "VIX Commerce <noreply@viaflix.com.br>",
        to: [to],
        subject: subject || "Purchase Order — VIX Commerce",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f, #2563eb); padding: 30px; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">📦 Purchase Order</h1>
              <p style="color: #93c5fd; margin: 8px 0 0;">VIX Commerce — Pedido de Compra</p>
            </div>
            <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                Segue em anexo o pedido de compra gerado pelo sistema VIX Commerce.
              </p>
              ${summary ? `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold; margin: 0 0 8px;">Resumo</p>
                <p style="color: #1e293b; font-size: 14px; margin: 0;">${summary}</p>
              </div>` : ''}
              <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                Este e-mail foi enviado automaticamente pelo sistema VIX Commerce.
              </p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: filename || "purchase_order.xls",
            content: base64Content,
          },
        ],
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend error:", errorData);
      return new Response(JSON.stringify({ error: `Email service error: ${errorData}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await emailResponse.json();
    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
