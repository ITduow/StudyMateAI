import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log(`[generate-summary:request] Received ${req.method} request`);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    console.log("[generate-summary:cors] Handling preflight OPTIONS request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const modelsToTry = Array.from(new Set([
      Deno.env.get("GEMINI_MODEL"),
      "gemini-2.5-flash",
      "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite"
    ].filter(Boolean)));

    console.log("[generate-summary:env] Validating environment variables...");
    if (!supabaseUrl) {
      console.error("[generate-summary:env-error] SUPABASE_URL environment variable is missing.");
    }
    if (!supabaseServiceKey) {
      console.error("[generate-summary:env-error] SERVICE_ROLE_KEY environment variable is missing.");
    }
    if (!geminiApiKey) {
      console.error("[generate-summary:env-error] GEMINI_API_KEY environment variable is missing.");
    }
    console.log(`[generate-summary:gemini-config] Primary model: ${Deno.env.get("GEMINI_MODEL")}. Configured models pool for trials: ${JSON.stringify(modelsToTry)}`);

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ 
        error: "Missing Supabase configuration env variables.",
        details: "Ensure SUPABASE_URL and SERVICE_ROLE_KEY are configured in Supabase Edge Secrets."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ 
        error: "Missing GEMINI_API_KEY environment variable.",
        details: "GEMINI_API_KEY must be set in your Supabase Edge Secrets environment."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[generate-summary:auth-error] Authorization header is missing.");
      return new Response(JSON.stringify({ 
        error: "Missing Authorization header",
        details: "An Authorization header with a valid user bearer token is required."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[generate-summary:auth] Authorization header present.");

    // 1. Initialize user client to verify user session
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    
    console.log("[generate-summary:auth] Authenticating user session via auth.getUser()...");
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("[generate-summary:auth-error] Unauthorized: User loading failed.", userError);
      return new Response(JSON.stringify({ 
        error: "Unauthorized: Invalid session",
        details: userError ? userError.message : "No active session found for the provided credentials."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-summary:auth-success] Authenticated as User ID: ${user.id}`);

    // Parse request body
    console.log("[generate-summary:body] Parsing request JSON payload...");
    let body;
    try {
      body = await req.json();
    } catch (err: any) {
      console.error("[generate-summary:body-error] Failed to parse request body as JSON:", err);
      return new Response(JSON.stringify({ 
        error: "Invalid JSON request body",
        details: err?.message || "Please provide a valid JSON body with documentId."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const documentId = body.documentId || body.docId;
    console.log(`[generate-summary:documentId] Extracted documentId: ${documentId}`);
    if (!documentId) {
      console.error("[generate-summary:body-error] Missing documentId in request body.");
      return new Response(JSON.stringify({ 
        error: "Missing documentId in request body",
        details: "Please specify 'documentId' inside the JSON payload."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Initialize service role client to fetch document and write summaries securely
    console.log("[generate-summary:db] Connecting admin client to fetch document metadata...");
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch document and double check user ownership
    const { data: doc, error: docError } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      console.error(`[generate-summary:db-error] Document mapping check failed. ID: ${documentId} User ID: ${user.id}`, docError);
      return new Response(JSON.stringify({ 
        error: "Document not found or access denied",
        details: docError ? docError.message : "The requested document either does not exist or does not belong to you."
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-summary:db-success] Found document "${doc.title}" for user.`);

    // --- AI LIMITS CHECK ---
    const action = "generate-summary";
    const freeLimit = 5;
    const premiumLimit = 100;
    let isPremium = false;

    try {
      console.log(`[generate-summary:limit-check] Fetching user profile for limit check...`);
      const { data: profile, error: profileErr } = await adminClient
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .single();

      if (profileErr || !profile) {
        console.error(`[generate-summary:limit-check-error] Profile fetch error:`, profileErr);
        return new Response(JSON.stringify({ 
          error: "Unable to verify AI usage limit",
          details: "Please try again later."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      isPremium = !!profile.is_premium;
      console.log(`[generate-summary:limit-check] User profile found. isPremium: ${isPremium}`);

      // Count today's rows from public.ai_usage_logs
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayStartISO = todayStart.toISOString();

      const { data: logs, error: logsErr } = await adminClient
        .from("ai_usage_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("action", action)
        .gte("created_at", todayStartISO);

      if (logsErr) {
        console.error(`[generate-summary:limit-check-error] Logs count fetch error:`, logsErr);
        return new Response(JSON.stringify({ 
          error: "Unable to verify AI usage limit",
          details: "Please try again later."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const todayUsage = logs?.length || 0;
      const limit = isPremium ? premiumLimit : freeLimit;
      console.log(`[generate-summary:limit-check] Usage today: ${todayUsage}/${limit}`);

      // Add detailed console logs as requested
      console.log(`AI LIMITS CHECK RESPONSE FOR ${action}:`);
      console.log(`- action: ${action}`);
      console.log(`- is_premium: ${isPremium}`);
      console.log(`- today usage count: ${todayUsage}`);
      console.log(`- daily limit: ${limit}`);

      if (todayUsage >= limit) {
        console.log(`- blocked or allowed: blocked`);
        console.warn(`[generate-summary:limit] Daily AI limit reached. todayUsage: ${todayUsage}, limit: ${limit}`);
        return new Response(JSON.stringify({ 
          error: "Daily AI limit reached",
          details: "Upgrade to Premium to continue."
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`- blocked or allowed: allowed`);
    } catch (checkErr: any) {
      console.error(`[generate-summary:limit-check-fatal] Fatal error during limit check:`, checkErr);
      return new Response(JSON.stringify({ 
        error: "Unable to verify AI usage limit",
        details: "Please try again later."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // --- END AI LIMITS CHECK ---

    const extractedText = doc.extracted_text || "";
    console.log(`[generate-summary:extractedText] Document source text length: ${extractedText.length} characters`);
    if (!extractedText.trim()) {
      console.error("[generate-summary:extractedText-error] Document text represents empty/blank content.");
      return new Response(JSON.stringify({ 
        error: "No extracted text available to summarize", 
        details: "This document contains no parsed text. Please try re-uploading a valid document."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Make the API call to Gemini
    console.log(`[generate-summary:gemini] Readying task summary generation with fallback-enabled pool...`);
    const prompt = `Analyze the student's study material text below and compile a structured, highly valuable study summary document.
You must return only a valid JSON object matching the following structure:
{
  "overview": "A concise paragraph (2-4 sentences) summarizing the main concepts, target theme, and overall abstract of the document.",
  "key_points": [
    "Key takeaways and core facts from first main theme",
    "Key study element / formula / theory from second main theme",
    "Additional milestone concept / timeline fact or logical insight"
  ],
  "summary_text": "A comprehensive, rich detailed text breakdown of the material using professional structured formatting, listing clear subheadings with detailed educational elaboration for thorough exam preparation or concept mastery."
}

Study material content to analyze:
---
${extractedText}
---

Your response must be ONLY valid JSON. Absolutely no markdown wrappers like \`\`\`json outside, conversational text, or preamble. Just raw JSON string.`;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let response = null;
    let successModel = "";
    let errText = "";

    for (let attempts = 0; attempts < modelsToTry.length; attempts++) {
      const rawModel = modelsToTry[attempts];
      const currentModel = rawModel.startsWith("models/") ? rawModel.substring(7) : rawModel;
      console.log(`[generate-summary:gemini] Attempt ${attempts + 1} of ${modelsToTry.length} trying model: "${currentModel}"`);
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
              },
            }),
          }
        );

        console.log(`[generate-summary:gemini-response] Model "${currentModel}" status: ${response.status}`);
        if (response.ok) {
          successModel = currentModel;
          console.log(`[generate-summary:gemini-success] Final success model: "${successModel}"`);
          break;
        }

        errText = await response.text();
        console.warn(`[generate-summary:gemini-warn] Model "${currentModel}" failed. Status ${response.status}. Details: ${errText}`);
        
        if (attempts + 1 < modelsToTry.length) {
          const nextModel = modelsToTry[attempts + 1];
          console.log(`[generate-summary:gemini-fallback] Fallback model selected: "${nextModel}"`);
          await delay(500);
        }
      } catch (fetchErr: any) {
        errText = fetchErr?.message || String(fetchErr);
        console.error(`[generate-summary:gemini-error] Exception trying model "${currentModel}":`, fetchErr);
        if (attempts + 1 < modelsToTry.length) {
          const nextModel = modelsToTry[attempts + 1];
          console.log(`[generate-summary:gemini-fallback] Fallback model selected: "${nextModel}"`);
          await delay(500);
        }
      }
    }

    if (!response || !response.ok) {
      console.error("[generate-summary:gemini-error] All configured models failed. Returning bad response.");
      return new Response(JSON.stringify({ 
        error: "Gemini API request failed",
        details: "All configured Gemini models failed or exceeded quota. Please try again later."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("[generate-summary:gemini-parse] Received candidate output, parsing JSON...");
    
    let parsedData;
    try {
      parsedData = JSON.parse(candidateText.trim());
    } catch (e: any) {
      console.warn("[generate-summary:gemini-parse-warning] Could not parse raw JSON. Cleanup code executing...", e);
      try {
        let cleanText = candidateText.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.substring(7);
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith("```")) {
          cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        parsedData = JSON.parse(cleanText.trim());
      } catch (innerErr: any) {
        console.error("[generate-summary:gemini-json-fatal] Gemini response was not in parsable JSON format.", candidateText);
        return new Response(JSON.stringify({ 
          error: "Failed to parse layout JSON from AI response",
          details: `Raw text returned: ${candidateText}. Error: ${innerErr?.message}`
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const responseOverview = parsedData.overview || "No overview available.";
    const responseKeyPoints = Array.isArray(parsedData.key_points) ? parsedData.key_points : [];
    const responseSummaryText = parsedData.summary_text || "No detailed breakdown available.";

    // 4. Check if summary already exists inside database
    console.log(`[generate-summary:db-check] Querying existing summary for Document ID: ${documentId}`);
    const { data: existingRecords, error: fetchErr } = await adminClient
      .from("summaries")
      .select("id")
      .eq("document_id", documentId);

    if (fetchErr) {
      console.error("[generate-summary:db-check-error] Fetching existing summary failed:", fetchErr);
    }

    let savedSummary;
    let saveError;

    if (existingRecords && existingRecords.length > 0) {
      console.log(`[generate-summary:db-save] Record exists. Performing UPDATE instead of upsert...`);
      const { data, error } = await adminClient
        .from("summaries")
        .update({
          overview: responseOverview,
          key_points: responseKeyPoints,
          summary_text: responseSummaryText,
          created_at: new Date().toISOString(),
        })
        .eq("document_id", documentId)
        .select()
        .single();
      
      savedSummary = data;
      saveError = error;
    } else {
      console.log(`[generate-summary:db-save] Record does not exist. Performing INSERT instead of upsert...`);
      const { data, error } = await adminClient
        .from("summaries")
        .insert({
          document_id: documentId,
          overview: responseOverview,
          key_points: responseKeyPoints,
          summary_text: responseSummaryText,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      savedSummary = data;
      saveError = error;
    }

    if (saveError) {
      console.error("[generate-summary:db-save-error] Failed to insert or update summary in DB.", saveError);
      return new Response(JSON.stringify({ 
        error: "Database save failure",
        details: saveError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-summary:db-save-success] Summary successfully saved for Document ID: ${documentId}`);

    // Log the AI usage securely
    console.log("[usage-log] inserting", action, user.id, documentId);
    const { error: logInsertErr } = await adminClient.from("ai_usage_logs").insert({
      user_id: user.id,
      document_id: documentId,
      action: action
    });

    if (logInsertErr) {
      console.error("[usage-log] insert failed", logInsertErr);
      return new Response(JSON.stringify({ 
        error: "Failed to record AI usage",
        details: logInsertErr.message || "An error occurred while inserting the usage log."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[usage-log] insert success");

    return new Response(JSON.stringify(savedSummary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[generate-summary:fatal] Unhandled error captured in Edge Function execute scope:", error);
    return new Response(JSON.stringify({ 
      error: "Edge Function internal server error", 
      details: error?.message || "An unknown error occurred inside the Deno worker."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
