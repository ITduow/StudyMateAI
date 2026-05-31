import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log(`[generate-flashcards:request] Received ${req.method} request`);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    console.log("[generate-flashcards:cors] Handling preflight OPTIONS request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const baseModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";

    // Setup model list to fallback gracefully if the primary model is unavailable or overloaded
    const modelsToTry = [
      baseModel,
      baseModel === "gemini-3.5-flash" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash",
      "gemini-flash-latest"
    ].filter((v, i, a) => a.indexOf(v) === i);

    console.log("[generate-flashcards:env] Validating environment variables...");
    if (!supabaseUrl) {
      console.error("[generate-flashcards:env-error] SUPABASE_URL environment variable is missing.");
    }
    if (!supabaseServiceKey) {
      console.error("[generate-flashcards:env-error] SUPABASE_SERVICE_ROLE_KEY environment variable is missing.");
    }
    if (!geminiApiKey) {
      console.error("[generate-flashcards:env-error] GEMINI_API_KEY environment variable is missing.");
    }
    console.log(`[generate-flashcards:gemini-config] Using primary model: ${baseModel}. Models pool for fallbacks: ${modelsToTry.join(", ")}`);

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ 
        error: "Missing Supabase configuration env variables.",
        details: "Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured in Supabase Edge Secrets."
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
      console.error("[generate-flashcards:auth-error] Authorization header is missing.");
      return new Response(JSON.stringify({ 
        error: "Missing Authorization header",
        details: "An Authorization header with a valid user bearer token is required."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[generate-flashcards:auth] Authorization header present.");

    // 1. Initialize user client to verify user session
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    
    console.log("[generate-flashcards:auth] Authenticating user session via auth.getUser()...");
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("[generate-flashcards:auth-error] Unauthorized: User loading failed.", userError);
      return new Response(JSON.stringify({ 
        error: "Unauthorized: Invalid session",
        details: userError ? userError.message : "No active session found for the provided credentials."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-flashcards:auth-success] Authenticated as User ID: ${user.id}`);

    // Parse request body
    console.log("[generate-flashcards:body] Parsing request JSON payload...");
    let body;
    try {
      body = await req.json();
    } catch (err: any) {
      console.error("[generate-flashcards:body-error] Failed to parse request body as JSON:", err);
      return new Response(JSON.stringify({ 
        error: "Invalid JSON request body",
        details: err?.message || "Please provide a valid JSON body with documentId."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const documentId = body.documentId || body.docId;
    console.log(`[generate-flashcards:documentId] Extracted documentId: ${documentId}`);
    if (!documentId) {
      console.error("[generate-flashcards:body-error] Missing documentId in request body.");
      return new Response(JSON.stringify({ 
        error: "Missing documentId in request body",
        details: "Please specify 'documentId' inside the JSON payload."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Initialize service role client to fetch document and write flashcards securely
    console.log("[generate-flashcards:db] Connecting admin client to fetch document metadata...");
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch document and double check user ownership
    const { data: doc, error: docError } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      console.error(`[generate-flashcards:db-error] Document mapping check failed. ID: ${documentId} User ID: ${user.id}`, docError);
      return new Response(JSON.stringify({ 
        error: "Document not found or access denied",
        details: docError ? docError.message : "The requested document either does not exist or does not belong to you."
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-flashcards:db-success] Found document "${doc.title}" for user.`);

    const extractedText = doc.extracted_text || "";
    console.log(`[generate-flashcards:extractedText] Document source text length: ${extractedText.length} characters`);
    if (!extractedText.trim()) {
      console.error("[generate-flashcards:extractedText-error] Document text represents empty/blank content.");
      return new Response(JSON.stringify({ 
        error: "No extracted text available to generate flashcards", 
        details: "This document contains no parsed text. Please try re-uploading a valid document."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Make the API call to Gemini with retry and model fallback logic for transient errors (like 503 / 429)
    console.log(`[generate-flashcards:gemini] Primed prompt for Gemini with target length: ${extractedText.length} characters.`);
    const prompt = `Analyze the student's study material text below and write a set of 8 to 15 high-quality flashcards to understand and master the concepts.
You must return only a valid JSON object matching the following structure:
{
  "flashcards": [
    {
      "front": "A key question, formula, term, concept, or prompt (brief and clear)",
      "back": "The answer, explanation, definition, or formula detail (precise and informative)"
    }
  ]
}

Study material content to analyze:
---
${extractedText}
---

Requirements:
1. Generate between 8 and 15 flashcards.
2. Ensure both 'front' and 'back' are non-empty strings.
3. Your response must be ONLY valid JSON. Absolutely no markdown wrappers like \`\`\`json outside, conversational text, or preamble. Just raw JSON string.`;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let response = null;
    let attempts = 0;
    const maxAttempts = 4;
    const baseDelayMs = 1500;
    let errText = "";

    while (attempts < maxAttempts) {
      attempts++;
      const currentModel = modelsToTry[Math.min(attempts - 1, modelsToTry.length - 1)];
      console.log(`[generate-flashcards:gemini] Attempt ${attempts} of ${maxAttempts} using model: ${currentModel}...`);
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

        console.log(`[generate-flashcards:gemini-response] API Response Status Code on attempt ${attempts} (Model: ${currentModel}): ${response.status}`);
        
        if (response.ok) {
          break; // Successful request, break the retry loop
        }

        errText = await response.text();
        console.warn(`[generate-flashcards:gemini-attempt-warn] Attempt ${attempts} returned error payload:`, errText);

        // Check for 503, 429, or other transient indicator keywords in body/code
        const isTransient = response.status === 503 ||
                            response.status === 429 ||
                            errText.includes("503") ||
                            errText.includes("UNAVAILABLE") ||
                            errText.includes("high demand") ||
                            errText.includes("RESOURCE_EXHAUSTED");

        if (isTransient && attempts < maxAttempts) {
          // Calculate exponential delay with randomized jitter
          const sleepTime = baseDelayMs * Math.pow(2, attempts - 1) + Math.random() * 500;
          console.log(`[generate-flashcards:gemini-retry] Transient error found (${response.status}). Retrying alternative model in ${Math.round(sleepTime)}ms...`);
          await delay(sleepTime);
        } else {
          break; // No retry for standard non-transient errors or maximum attempts exceeded
        }
      } catch (fetchErr: any) {
        console.error(`[generate-flashcards:gemini-fetch-error] Fetch exception during attempt ${attempts}:`, fetchErr);
        errText = fetchErr?.message || String(fetchErr);
        if (attempts < maxAttempts) {
          const sleepTime = baseDelayMs * Math.pow(2, attempts - 1);
          console.log(`[generate-flashcards:gemini-retry] Exception caught. Retrying alternative model in ${Math.round(sleepTime)}ms...`);
          await delay(sleepTime);
        } else {
          break;
        }
      }
    }

    if (!response || !response.ok) {
      console.error("[generate-flashcards:gemini-fatal] Gemini API failed after multiple retries:", errText);
      return new Response(JSON.stringify({ 
        error: "Gemini API call failed",
        details: errText || "The model is currently experiencing high demand or authentication was refused. Please try again."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("[generate-flashcards:gemini-parse] Received candidate output, parsing JSON...");
    
    let parsedData;
    try {
      parsedData = JSON.parse(candidateText.trim());
    } catch (e: any) {
      console.warn("[generate-flashcards:gemini-parse-warning] Could not parse raw JSON. Cleanup code executing...", e);
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
        console.error("[generate-flashcards:gemini-json-fatal] Gemini response was not in parsable JSON format.", candidateText);
        return new Response(JSON.stringify({ 
          error: "Failed to parse flashcards JSON from AI response",
          details: `Raw text returned: ${candidateText}. Error: ${innerErr?.message}`
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const cardsArray = Array.isArray(parsedData.flashcards) ? parsedData.flashcards : [];
    console.log(`[generate-flashcards:validate] AI generated ${cardsArray.length} flashcards.`);

    const validatedCards = cardsArray
      .filter((c: any) => c && typeof c === "object" && String(c.front || "").trim() && String(c.back || "").trim())
      .map((c: any) => ({
        document_id: documentId,
        front: String(c.front).trim(),
        back: String(c.back).trim(),
        leitner_box: 1,
        created_at: new Date().toISOString()
      }));

    if (validatedCards.length === 0) {
      console.error("[generate-flashcards:validate-error] No valid flashcards remained after cleaning/filtering.");
      return new Response(JSON.stringify({ 
        error: "AI failed to generate valid flashcard prompts", 
        details: "The model returned an empty deck or improperly shaped card pairs. Please execute regeneration."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-flashcards:db-delete] Deleting previous flashcards associated with Document ID: ${documentId}...`);
    const { error: deleteError } = await adminClient
      .from("flashcards")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      console.warn("[generate-flashcards:db-delete-warning] Deletion returned warning/error (ignoring to proceed standard write):", deleteError.message);
    }

    console.log(`[generate-flashcards:db-insert] Inserting ${validatedCards.length} fresh flashcards...`);
    const { data: insertedData, error: insertError } = await adminClient
      .from("flashcards")
      .insert(validatedCards)
      .select();

    if (insertError) {
      console.error("[generate-flashcards:db-insert-error] Failed to insert flashcards in DB:", insertError);
      return new Response(JSON.stringify({ 
        error: "Database insertion failure",
        details: insertError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-flashcards:db-save-success] Successfully inserted ${validatedCards.length} flashcards for Document ID: ${documentId}`);
    return new Response(JSON.stringify(insertedData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[generate-flashcards:fatal] Unhandled error captured in Edge Function scope:", error);
    return new Response(JSON.stringify({ 
      error: "Edge Function internal server error", 
      details: error?.message || "An unknown error occurred inside the Deno worker."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
