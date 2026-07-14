import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-goog-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  // Only signed-in users may spend the server-held GEMINI_API_KEY. supabase-js
  // functions.invoke() attaches the caller's access token as a Bearer header;
  // the anon key is also a valid JWT but resolves to no user, so getUser()
  // rejects it. This keeps the proxy from being an open gateway to a paid API.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonError("Missing authorization token", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Server auth is not configured", 500);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonError("Unauthorized: a valid signed-in session is required", 401);
  }

  try {
    const { model, path, payload } = await req.json();

    if (!model) {
      return new Response(JSON.stringify({ error: { message: "Model parameter is required" } }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Try finding the key: check incoming x-goog-api-key header first,
    // then fallback to server environment variable GEMINI_API_KEY
    const clientKey = req.headers.get("x-goog-api-key");
    const apiKey = clientKey || Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: { 
          message: "Gemini API key is not configured. Please set GEMINI_API_KEY on the server or provide it in your client settings." 
        } 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiPath = path || "generateContent";
    // Key travels in a header, never the URL — query strings end up in request logs.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${apiPath}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: { message: error.message } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
