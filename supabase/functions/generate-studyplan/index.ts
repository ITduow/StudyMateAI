import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log(`[generate-studyplan:request] Received ${req.method} request`);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    console.log("[generate-studyplan:cors] Handling preflight OPTIONS request");
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

    console.log("[generate-studyplan:env] Validating environment variables...");
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
      console.error("[generate-studyplan:auth-error] Authorization header is missing.");
      return new Response(JSON.stringify({ 
        error: "Missing Authorization header",
        details: "An Authorization header with a valid user bearer token is required."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Initialize user client to verify user session
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    
    console.log("[generate-studyplan:auth] Authenticating user session via auth.getUser()...");
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("[generate-studyplan:auth-error] Unauthorized: User loading failed.", userError);
      return new Response(JSON.stringify({ 
        error: "Unauthorized: Invalid session",
        details: userError ? userError.message : "No active session found for the provided credentials."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-studyplan:auth-success] Authenticated as User ID: ${user.id}`);

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (err: any) {
      console.error("[generate-studyplan:body-error] Failed to parse request body as JSON:", err);
      return new Response(JSON.stringify({ 
        error: "Invalid JSON request body",
        details: err?.message || "Please provide a valid JSON body with documentId."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const documentId = body.documentId || body.docId;
    if (!documentId) {
      return new Response(JSON.stringify({ 
        error: "Missing documentId in request body",
        details: "Please specify 'documentId' inside the JSON payload."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Initialize service role client to fetch document and write study plan securely
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch document and double check user ownership
    const { data: doc, error: docError } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      console.error(`[generate-studyplan:db-error] Document mapping check failed. ID: ${documentId} User ID: ${user.id}`, docError);
      return new Response(JSON.stringify({ 
        error: "Document not found or access denied",
        details: docError ? docError.message : "The requested document either does not exist or does not belong to you."
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- AI LIMITS CHECK ---
    const action = "generate-studyplan";
    const freeLimit = 3; // 3 per day for study plans!
    const premiumLimit = 100;
    let isPremium = false;

    try {
      console.log(`[generate-studyplan:limit-check] Fetching user profile for limit check...`);
      const { data: profile, error: profileErr } = await adminClient
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .single();

      if (profileErr || !profile) {
        console.error(`[generate-studyplan:limit-check-error] Profile fetch error:`, profileErr);
        return new Response(JSON.stringify({ 
          error: "Unable to verify AI usage limit",
          details: "Please try again later."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      isPremium = !!profile.is_premium;
      console.log(`[generate-studyplan:limit-check] User profile found. isPremium: ${isPremium}`);

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
        console.error(`[generate-studyplan:limit-check-error] Logs count fetch error:`, logsErr);
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
      console.log(`[generate-studyplan:limit-check] Usage today: ${todayUsage}/${limit}`);

      // Add detailed console logs as requested
      console.log(`AI LIMITS CHECK RESPONSE FOR ${action}:`);
      console.log(`- action: ${action}`);
      console.log(`- is_premium: ${isPremium}`);
      console.log(`- today usage count: ${todayUsage}`);
      console.log(`- daily limit: ${limit}`);

      if (todayUsage >= limit) {
        console.log(`- blocked or allowed: blocked`);
        console.warn(`[generate-studyplan:limit] Daily AI limit reached. todayUsage: ${todayUsage}, limit: ${limit}`);
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
      console.error(`[generate-studyplan:limit-check-fatal] Fatal error during limit check:`, checkErr);
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
    if (!extractedText.trim()) {
      return new Response(JSON.stringify({ 
        error: "No extracted text available to generate study plan", 
        details: "This document contains no parsed text."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. AI Study Plan Generation via Gemini API with Retry & Fallback
    const prompt = `Analyze the student's study material text below and write a tailored 7-Day step-by-step master study plan.
You must return only a valid JSON array matching the following schema and structure:
[
  {
    "id": "task-1-1",
    "day": 1,
    "dayNumber": 1,
    "title": "A descriptive, engaging topic or activity name for this day",
    "description": "Clear step-by-step instructions or focal points on what the student should study and practice.",
    "estimated_minutes": 30,
    "completed": false,
    "isCompleted": false
  }
]

Study material content to analyze:
---
${extractedText.slice(0, 10000)}
---

Requirements:
1. Generate exactly 7 days of timeline.
2. For each day, from Day 1 to Day 7, generate 1 to 3 relevant study/practice tasks based on the provided material.
3. Every task must have "id", "day", "dayNumber", "title", "description", "estimated_minutes" (integer), "completed" (boolean), and "isCompleted" (boolean).
4. Your response must be ONLY a valid JSON array. Do NOT wrap in \`\`\`json markdown blocks, and do NOT include any introductory or concluding conversational text. Just the raw valid JSON array.`;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let response = null;
    let successModel = "";
    let errText = "";

    for (let attempts = 0; attempts < modelsToTry.length; attempts++) {
      const rawModel = modelsToTry[attempts];
      const currentModel = rawModel.startsWith("models/") ? rawModel.substring(7) : rawModel;
      console.log(`[generate-studyplan:gemini] Attempt ${attempts + 1} of ${modelsToTry.length} trying model: "${currentModel}"`);
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        console.log(`[generate-studyplan:gemini-response] Model "${currentModel}" status: ${response.status}`);
        if (response.ok) {
          successModel = currentModel;
          console.log(`[generate-studyplan:gemini-success] Final success model: "${successModel}"`);
          break;
        }

        errText = await response.text();
        console.warn(`[generate-studyplan:gemini-warn] Model "${currentModel}" failed. Status ${response.status}. Details: ${errText}`);
        
        if (attempts + 1 < modelsToTry.length) {
          const nextModel = modelsToTry[attempts + 1];
          console.log(`[generate-studyplan:gemini-fallback] Fallback model selected: "${nextModel}"`);
          await delay(500);
        }
      } catch (fetchErr: any) {
        errText = fetchErr?.message || String(fetchErr);
        console.error(`[generate-studyplan:gemini-error] Exception trying model "${currentModel}":`, fetchErr);
        if (attempts + 1 < modelsToTry.length) {
          const nextModel = modelsToTry[attempts + 1];
          console.log(`[generate-studyplan:gemini-fallback] Fallback model selected: "${nextModel}"`);
          await delay(500);
        }
      }
    }

    if (!response || !response.ok) {
      console.error("[generate-studyplan:gemini-error] All configured models failed. Returning bad response.");
      return new Response(JSON.stringify({ 
        error: "Gemini API request failed",
        details: "All configured Gemini models failed or exceeded quota. Please try again later."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    let tasksData;
    try {
      tasksData = JSON.parse(candidateText.trim());
    } catch (e: any) {
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
        tasksData = JSON.parse(cleanText.trim());
      } catch (innerErr) {
        return new Response(JSON.stringify({ 
          error: "Failed to parse study plan JSON from AI response",
          details: `Raw text returned: ${candidateText}`
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rawTasks = Array.isArray(tasksData) ? tasksData : [];
    const cleanTasks = rawTasks.map((t: any, idx: number) => {
      const dayVal = Number(t.day || t.dayNumber || Math.floor(idx / 2) + 1);
      return {
        id: String(t.id || `task-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)}`),
        day: dayVal,
        dayNumber: dayVal,
        title: String(t.title || `Study Focus Material`).trim(),
        description: String(t.description || "Review assigned parts and master learning materials.").trim(),
        estimated_minutes: Number(t.estimated_minutes || t.estimatedMinutes || 30),
        completed: false,
        isCompleted: false
      };
    });

    if (cleanTasks.length === 0) {
      // Create default tasks if AI returns empty array
      for (let idx = 0; idx < 7; idx++) {
        cleanTasks.push({
          id: `task-def-${idx}`,
          day: idx + 1,
          dayNumber: idx + 1,
          title: `Focus Study Chapter Section ${idx + 1}`,
          description: `Analyze, review and master key objectives for materials in chapter section ${idx + 1}.`,
          estimated_minutes: 30,
          completed: false,
          isCompleted: false
        });
      }
    }

    console.log(`[generate-studyplan:db-delete] Deleting previous plan for Document ID: ${documentId} for user ${user.id}...`);
    await adminClient
      .from("study_plans")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", user.id);

    const docNameClean = String(doc.title || "Document Study").replace(/\.[^/.]+$/, "");
    const planRecord = {
      user_id: user.id,
      document_id: documentId,
      title: `7-Day Study Plan: ${docNameClean}`,
      duration_days: 7,
      tasks: cleanTasks,
      created_at: new Date().toISOString()
    };

    console.log(`[generate-studyplan:db-insert] Inserting new study plan to table...`);
    const { data: insertedData, error: insertError } = await adminClient
      .from("study_plans")
      .insert(planRecord)
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: "Database insertion failure", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-studyplan:db-save-success] Successfully created study plan for Document ID: ${documentId}`);

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

    return new Response(JSON.stringify(insertedData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: "Edge Function internal server error", 
      details: error?.message || "An unknown error occurred inside the Deno worker."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
