import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log(`[generate-quiz:request] Received ${req.method} request`);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    console.log("[generate-quiz:cors] Handling preflight OPTIONS request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    const baseModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";

    const modelsToTry = [
      baseModel,
      baseModel === "gemini-3.5-flash" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash",
      "gemini-flash-latest"
    ].filter((v, i, a) => a.indexOf(v) === i);

    console.log("[generate-quiz:env] Validating environment variables...");
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
    
    console.log("[generate-quiz:auth] Authenticating user session via auth.getUser()...");
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ 
        error: "Unauthorized: Invalid session",
        details: userError ? userError.message : "No active session found for the provided credentials."
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[generate-quiz:auth-success] Authenticated as User ID: ${user.id}`);

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (err: any) {
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

    // 2. Initialize service role client to fetch document and write quiz securely
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch document and double check user ownership
    const { data: doc, error: docError } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ 
        error: "Document not found or access denied",
        details: docError ? docError.message : "The requested document either does not exist or does not belong to you."
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extractedText = doc.extracted_text || "";
    if (!extractedText.trim()) {
      return new Response(JSON.stringify({ 
        error: "No extracted text available to generate quiz", 
        details: "This document contains no parsed text."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. AI Quiz Generation via Gemini API with Retry & Fallback
    const prompt = `Analyze the student's study material text below and create exactly 4 premium quality Multiple-Choice quiz questions.
You must return only a valid JSON array matching the following structure:
[
  {
    "text": "Clear and specific multiple choice question text",
    "option_a": "First possible answer choice",
    "option_b": "Second possible answer choice",
    "option_c": "Third possible answer choice",
    "option_d": "Fourth possible answer choice",
    "correct_answer": "A", // must be EXACTLY "A", "B", "C", or "D" matching the options
    "explanation": "Provide a concise explanation explaining why the correct choice is correct based on the text."
  }
]

Study material content to analyze:
---
${extractedText.slice(0, 8000)}
---

Requirements:
1. Generate exactly 4 multiple-choice questions.
2. In 'correct_answer', you must strictly choose only from "A", "B", "C", or "D".
3. Your response must be ONLY valid JSON array of questions. Absolutely no markdown wrappers like \`\`\`json outside, conversational text, or preamble. Just raw JSON string.`;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let response = null;
    let attempts = 0;
    const maxAttempts = 4;
    const baseDelayMs = 1500;
    let errText = "";

    while (attempts < maxAttempts) {
      attempts++;
      const currentModel = modelsToTry[Math.min(attempts - 1, modelsToTry.length - 1)];
      console.log(`[generate-quiz:gemini] Attempt ${attempts} of ${maxAttempts} using model: ${currentModel}...`);
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

        console.log(`[generate-quiz:gemini-response] Response Status on attempt ${attempts}: ${response.status}`);
        if (response.ok) {
          break;
        }

        errText = await response.text();
        console.warn(`[generate-quiz:gemini-warn] Attempt ${attempts} error payload:`, errText);

        const isTransient = response.status === 503 ||
                            response.status === 429 ||
                            errText.includes("503") ||
                            errText.includes("UNAVAILABLE") ||
                            errText.includes("high demand") ||
                            errText.includes("RESOURCE_EXHAUSTED");

        if (isTransient && attempts < maxAttempts) {
          const sleepTime = baseDelayMs * Math.pow(2, attempts - 1) + Math.random() * 500;
          await delay(sleepTime);
        } else {
          break;
        }
      } catch (fetchErr: any) {
        errText = fetchErr?.message || String(fetchErr);
        if (attempts < maxAttempts) {
          const sleepTime = baseDelayMs * Math.pow(2, attempts - 1);
          await delay(sleepTime);
        } else {
          break;
        }
      }
    }

    if (!response || !response.ok) {
      return new Response(JSON.stringify({ 
        error: "Gemini API call failed",
        details: errText || "The model is currently experiencing high demand. Please try again."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    let rawQuestions;
    try {
      rawQuestions = JSON.parse(candidateText.trim());
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
        rawQuestions = JSON.parse(cleanText.trim());
      } catch (innerErr) {
        return new Response(JSON.stringify({ 
          error: "Failed to parse quiz questions JSON from AI response",
          details: `Raw text returned: ${candidateText}`
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const arrayQuestions = Array.isArray(rawQuestions) ? rawQuestions : [];
    if (arrayQuestions.length === 0) {
      return new Response(JSON.stringify({ 
        error: "AI failed to generate quiz questions", 
        details: "The model returned an empty deck or improperly shaped array."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-quiz:db-delete] Deleting previous quizzes associated with Document ID: ${documentId}...`);
    // Deliberately query for previous quizzes to delete their associate questions (if cascading delete is not enabled in DB rules)
    const { data: oldQuizzes } = await adminClient
      .from("quizzes")
      .select("id")
      .eq("document_id", documentId);

    if (oldQuizzes && oldQuizzes.length > 0) {
      const oldQuizIds = oldQuizzes.map(q => q.id);
      await adminClient.from("questions").delete().in("quiz_id", oldQuizIds);
    }
    
    await adminClient
      .from("quizzes")
      .delete()
      .eq("document_id", documentId);

    // Insert new Quiz record
    const docTitleClean = String(doc.title || "Practice").replace(/\.[^/.]+$/, "");
    console.log(`[generate-quiz:db-insert] Inserting quiz metadata...`);
    const { data: newQuiz, error: insertQuizErr } = await adminClient
      .from("quizzes")
      .insert({
        document_id: documentId,
        title: `${docTitleClean} Practice Quiz`,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertQuizErr || !newQuiz) {
      return new Response(JSON.stringify({ error: "Failed to insert quiz into database", details: insertQuizErr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert questions associated with this new quiz ID
    const questionsToInsert = arrayQuestions.map((q: any) => {
      // Normalize 'correct_answer' to A, B, C, or D
      let correct = String(q.correct_answer || q.correctAnswer || "A").trim().toUpperCase();
      if (correct === "0" || correct.includes("0") || correct === "A") correct = "A";
      else if (correct === "1" || correct.includes("1") || correct === "B") correct = "B";
      else if (correct === "2" || correct.includes("2") || correct === "C") correct = "C";
      else if (correct === "3" || correct.includes("3") || correct === "D") correct = "D";
      else correct = "A"; // fallback

      // Normalize Option properties (AI sometimes outputs options array or option_a, option_b)
      let optA = q.option_a || (q.options && q.options[0]) || "Option A";
      let optB = q.option_b || (q.options && q.options[1]) || "Option B";
      let optC = q.option_c || (q.options && q.options[2]) || "Option C";
      let optD = q.option_d || (q.options && q.options[3]) || "Option D";

      return {
        quiz_id: newQuiz.id,
        question_text: String(q.text || q.question || q.question_text || "Identify key concept").trim(),
        option_a: String(optA).trim(),
        option_b: String(optB).trim(),
        option_c: String(optC).trim(),
        option_d: String(optD).trim(),
        correct_answer: correct,
        explanation: String(q.explanation || "").trim(),
        created_at: new Date().toISOString()
      };
    });

    console.log(`[generate-quiz:db-insert] Inserting ${questionsToInsert.length} questions associated with Quiz ID ${newQuiz.id}...`);
    const { error: insertQuestionsErr } = await adminClient
      .from("questions")
      .insert(questionsToInsert);

    if (insertQuestionsErr) {
      return new Response(JSON.stringify({ error: "Failed to save quiz questions into database", details: insertQuestionsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-quiz:complete] Successfully generated quiz and questions!`);
    return new Response(JSON.stringify({ success: true, quiz: newQuiz, questionsCount: questionsToInsert.length }), {
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
