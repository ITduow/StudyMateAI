import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[upgrade-premium] Request received");

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.error("[upgrade-premium] Missing authorization header");

      return jsonResponse(
        {
          error: "Missing authorization header",
          details: "Please login again.",
        },
        401
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) {
      console.error("[upgrade-premium] Missing SUPABASE_URL");

      return jsonResponse(
        {
          error: "Supabase environment variables are missing",
          details: "SUPABASE_URL is not available.",
        },
        500
      );
    }

    if (!serviceRoleKey) {
      console.error("[upgrade-premium] Missing SERVICE_ROLE_KEY");

      return jsonResponse(
        {
          error: "SERVICE_ROLE_KEY is not configured",
          details: "Add SERVICE_ROLE_KEY in Supabase Edge Function Secrets.",
        },
        500
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      console.error("[upgrade-premium] Unauthorized user:", userError);

      return jsonResponse(
        {
          error: "Unauthorized user",
          details: userError?.message || "Please login again.",
        },
        401
      );
    }

    console.log("[upgrade-premium] Authenticated user:", user.id);

    const { data: existingProfile, error: existingProfileError } =
      await adminClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (existingProfileError) {
      console.error(
        "[upgrade-premium] Failed checking existing profile:",
        existingProfileError
      );

      return jsonResponse(
        {
          error: "Failed to check profile",
          details: existingProfileError.message,
        },
        500
      );
    }

    if (!existingProfile) {
      console.log("[upgrade-premium] Profile missing. Creating premium profile.");

      const { data: createdProfile, error: createError } = await adminClient
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email || "",
          full_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email ||
            "Student",
          role: "student",
          is_premium: true,
        })
        .select("*")
        .single();

      if (createError || !createdProfile) {
        console.error("[upgrade-premium] Failed creating profile:", createError);

        return jsonResponse(
          {
            error: "Failed to create premium profile",
            details: createError?.message || "No profile returned.",
          },
          500
        );
      }

      console.log("[upgrade-premium] Premium profile created:", user.id);

      return jsonResponse({
        message: "Premium activated for demo.",
        profile: createdProfile,
      });
    }

    console.log("[upgrade-premium] Existing profile found:", existingProfile.id);

    if (existingProfile.is_premium === true) {
      console.log("[upgrade-premium] User is already premium:", user.id);

      return jsonResponse({
        message: "Premium is already active.",
        profile: existingProfile,
      });
    }

    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update({
        is_premium: true,
      })
      .eq("id", user.id)
      .select("*")
      .single();

    if (updateError || !updatedProfile) {
      console.error("[upgrade-premium] Failed updating profile:", updateError);

      return jsonResponse(
        {
          error: "Failed to upgrade account",
          details: updateError?.message || "No profile returned.",
        },
        500
      );
    }

    console.log("[upgrade-premium] Premium activated:", user.id);

    return jsonResponse({
      message: "Premium activated for demo.",
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("[upgrade-premium] Unexpected error:", error);

    return jsonResponse(
      {
        error: "Unexpected upgrade error",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
