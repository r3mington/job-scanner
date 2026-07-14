import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// telegram-feed: read-only ingestion of a PUBLIC Telegram channel's web
// preview (https://t.me/s/<channel>). No credentials, no bot, no interaction —
// only what Telegram already publishes to any browser. Returns the recent
// posts as clean JSON for the client-side scan pipeline.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Convert a message-text HTML fragment to readable plain text.
function htmlToText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, (_m, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      // Keep the destination when the visible label hides it (evidence value).
      return label && href.includes(label) ? label : `${label} (${href})`;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { channel, after } = await req.json();

    const clean = String(channel || "").replace(/^@/, "").trim();
    if (!/^[A-Za-z0-9_]{4,32}$/.test(clean)) {
      return json({ error: { message: "Invalid channel username" } });
    }

    // t.me occasionally drops off DNS (observed 2026-07); Telegram serves the
    // identical preview on its official mirror domains, so walk the list.
    const hosts = ["t.me", "telegram.dog", "telegram.me"];
    let res: Response | null = null;
    let lastErr = "";
    for (const host of hosts) {
      try {
        const attempt = await fetch(`https://${host}/s/${clean}`, {
          headers: { "User-Agent": "Mozilla/5.0 (SentinelAI read-only research fetch)" },
        });
        if (attempt.ok) { res = attempt; break; }
        lastErr = `${host} returned ${attempt.status}`;
      } catch (e) {
        lastErr = `${host}: ${(e as Error).message}`;
      }
    }
    if (!res) {
      return json({ error: { message: `Telegram preview unreachable (${lastErr})` } });
    }
    const html = await res.text();

    // Channels without a public preview redirect to a join page.
    if (!html.includes("tgme_widget_message")) {
      return json({ error: { message: "Channel has no public web preview (private, group, or nonexistent)" } });
    }

    const channelTitle = (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || clean;

    // Each post block carries data-post="<channel>/<id>". Split on that anchor
    // and read the text/time inside each block.
    const posts: { id: number; date: string | null; text: string; link: string }[] = [];
    const blockRegex = /data-post="([^"]+\/(\d+))"([\s\S]*?)(?=data-post="|<\/main>|$)/g;
    let m: RegExpExecArray | null;
    while ((m = blockRegex.exec(html)) !== null) {
      const id = Number(m[2]);
      const block = m[3];
      const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (!textMatch) continue; // service messages / media-only posts
      const text = htmlToText(textMatch[1]);
      if (!text || text.length < 25) continue; // skip stickers, reactions, stubs
      const date = (block.match(/<time[^>]*datetime="([^"]+)"/) || [])[1] || null;
      posts.push({ id, date, text, link: `https://t.me/${m[1]}` });
    }

    // Dedupe (pinned posts can repeat), keep newest order, apply `after` cursor.
    const seen = new Set<number>();
    const afterId = Number(after) || 0;
    const result = posts
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .filter((p) => p.id > afterId)
      .sort((a, b) => a.id - b.id); // oldest-first so the client scans chronologically

    return json({ channel: clean, title: channelTitle, count: result.length, posts: result });
  } catch (error) {
    // 200 with an error object: supabase-js swallows non-2xx bodies, and the
    // client already routes data.error to its log with the real message.
    return json({ error: { message: (error as Error).message } });
  }
});
