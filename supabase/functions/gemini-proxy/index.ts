import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-goog-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
