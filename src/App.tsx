/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { HomeView } from "./components/HomeView";
import { DashboardView } from "./components/DashboardView";
import { DocumentDetailView } from "./components/DocumentDetailView";
import { QuizView } from "./components/QuizView";
import { FlashcardView } from "./components/FlashcardView";
import { AdminView } from "./components/AdminView";
import { User, Document, Summary, Quiz, Flashcard, StudyPlan, UserProgress } from "./types";
import { AlertCircle, Loader, CheckCircle2, Sparkles } from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";

/**
 * DEVELOPER NOTE — SUPABASE AUTHENTICATION URL CONFIGURATION:
 * -------------------------------------------------------------
 * To ensure the Forget / Reset password flow redirects to the proper
 * web screens, you MUST configure the following in your Supabase Dashboard:
 * 
 * 1. Site URL:
 *    - production Vercel URL (e.g., https://your-domain.vercel.app)
 * 
 * 2. Redirect URLs (Additional Redirect URLs):
 *    - https://your-domain.vercel.app/*
 *    - http://localhost:5173/*  (for local development routing)
 * 
 * 3. Environment Variables (VITE_APP_URL):
 *    - In Vercel, set:
 *      VITE_APP_URL=https://study-mate-ai.vercel.app
 *    - For local dev, use:
 *      VITE_APP_URL=http://localhost:5173
 */

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<string>("home");
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false);
  
  // Data State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  // Cached active materials for selected document
  const [selectedDocMaterials, setSelectedDocMaterials] = useState<{
    document: Document;
    summary: Summary | null;
    quiz: Quiz | null;
    flashcards: Flashcard[];
    studyPlan: StudyPlan | null;
  } | null>(null);

  const [progress, setProgress] = useState<UserProgress>({
    userId: "",
    quizzes: [],
    flashcardProgress: {},
    totalAIUsage: 0,
    lastActive: ""
  });

  const [upcomingTasks, setUpcomingTasks] = useState<any[]>([]);

  // Global Loaders
  const [isBooting, setIsBooting] = useState(true);
  const [errorBanner, setErrorBanner] = useState<React.ReactNode | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Handle payOS payment success/cancel query triggers and account password recovery checks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const isRecoveryUrl = params.get("auth") === "reset-password" || window.location.hash.includes("type=recovery");

    if (isRecoveryUrl) {
      console.log("[RecoveryDetect:Effect] Redirected from account security link. Initializing reset state.");
      setIsResetPasswordMode(true);
      setCurrentView("home");
      
      // Delay replacing state so Supabase has ample time to parse the hash/query parameters!
      const clearTimer = setTimeout(() => {
        try {
          const urlStr = window.location.pathname;
          window.history.replaceState({}, document.title, urlStr);
        } catch (err) {
          console.warn("[App:HistoryState] Failed clean recovery url parameters:", err);
        }
      }, 3500);
      return () => clearTimeout(clearTimer);
    }

    if (paymentStatus === "success") {
      setSuccessBanner("Payment submitted. Premium will activate after bank confirmation.");
      
      // Clean query parameters from URL
      try {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      } catch (historyErr) {
        console.warn("[App:HistoryState] Failed to rewrite search clean:", historyErr);
      }

      // Wait 3 seconds, then refetch current profile from Supabase
      const timer = setTimeout(async () => {
        if (isSupabaseConfigured && supabase) {
          try {
            console.log("[payOS SUCCESS Refetch] Auto-polling user profile status 3s after successful checkout redirect...");
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
              const { data: profile, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", session.user.id)
                .single();
              
              if (!error && profile) {
                console.log("[payOS SUCCESS Refetch] Fetched profile:", profile);
                if (profile.is_premium) {
                  // premium active! Sync locally to update badge
                  setCurrentUser(prevUser => {
                    if (!prevUser) return null;
                    return {
                      ...prevUser,
                      subscription: "premium"
                    };
                  });
                  setSuccessBanner("Premium activated successfully!");
                  // Reload active user workspace data like limits
                  await loadSupabaseWorkspaceData(session.user.id, {
                    id: session.user.id,
                    email: session.user.email || "",
                    name: profile.full_name || "Student",
                    role: (profile.role || "student") as "student" | "admin",
                    subscription: "premium",
                    createdAt: profile.created_at || new Date().toISOString()
                  });
                } else {
                  console.log("[payOS SUCCESS Refetch] profile.is_premium is still false. Waiting for bank webhook callback.");
                }
              } else if (error) {
                console.warn("[payOS SUCCESS Refetch] Error fetching profile:", error);
              }
            }
          } catch (refetchErr) {
            console.error("[payOS SUCCESS Refetch] Failed to perform profile refetch:", refetchErr);
          }
        }
      }, 3000);

      return () => clearTimeout(timer);
    } else if (paymentStatus === "cancel") {
      setErrorBanner("Payment was cancelled.");
      
      // Clean query parameters from URL
      try {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      } catch (historyErr) {
        console.warn("[App:HistoryState] Failed to rewrite search clean on cancel:", historyErr);
      }
    }
  }, [currentUser]);

  // Authenticate on startup
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      // Check query parameter on startup
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "reset-password" || window.location.hash.includes("type=recovery")) {
        console.log("[Startup] Redirected for password reset. Setting recovery mode.");
        setIsResetPasswordMode(true);
        setCurrentView("home");
      }

      // Get initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          bootstrapSupabaseSession(session);
        } else {
          setIsBooting(false);
        }
      });

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          console.log("[AuthListener]PASSWORD_RECOVERY triggered.");
          setIsResetPasswordMode(true);
          setCurrentView("home");
        } else if (event === "SIGNED_IN" && session) {
          bootstrapSupabaseSession(session);
        } else if (event === "SIGNED_OUT") {
          handleLogoutCleanup();
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      const token = localStorage.getItem("studymate_token");
      if (token) {
        bootstrapSession(token);
      } else {
        setIsBooting(false);
      }
    }
  }, []);

  const bootstrapSession = async (token: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { "Authorization": token }
      });
      if (res.ok) {
        const user: User = await res.json();
        setCurrentUser(user);
        // Load operational databases
        await loadWorkspaceData(token, user);
        
        // If currentView is home, auto route to dashboard
        if (currentView === "home") {
          setCurrentView("dashboard");
        }
      } else {
        localStorage.removeItem("studymate_token");
      }
    } catch (err) {
      console.error("Session authentication boot failed: ", err);
    } finally {
      setIsBooting(false);
    }
  };

  const bootstrapSupabaseSession = async (session: any) => {
    try {
      setIsBooting(true);
      const authUser = session.user;
      
      const { data: profile, error } = await supabase!
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();
        
      if (error || !profile) {
        console.warn("Could not find auto-created profile. Upserting client fallback user...", error);
        const fallbackProfile = {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "Student",
          email: authUser.email || "",
          role: "student",
          is_premium: false
        };
        
        await supabase!
          .from("profiles")
          .upsert(fallbackProfile);

        const mapped: User = {
          id: authUser.id,
          email: authUser.email || "",
          name: fallbackProfile.full_name,
          role: "student",
          subscription: "free",
          createdAt: new Date().toISOString()
        };
        setCurrentUser(mapped);
        await loadSupabaseWorkspaceData(authUser.id, mapped);
      } else {
        const mapped: User = {
          id: authUser.id,
          email: authUser.email || "",
          name: profile.full_name || authUser.email?.split("@")[0] || "Student",
          role: (profile.role || "student") as "student" | "admin",
          subscription: profile.is_premium ? "premium" : "free",
          createdAt: profile.created_at || new Date().toISOString()
        };
        setCurrentUser(mapped);
        await loadSupabaseWorkspaceData(authUser.id, mapped);
      }

      const isRecovery = window.location.search.includes("auth=reset-password") || 
                         window.location.hash.includes("type=recovery") || 
                         isResetPasswordMode;

      if (isRecovery) {
        console.log("[bootstrapSupabaseSession] Recovery flow detected. Restricting auto-redirect to dashboard to keep password reset visible.");
        setIsResetPasswordMode(true);
        setCurrentView("home");
      } else if (currentView === "home") {
        setCurrentView("dashboard");
      }
    } catch (err) {
      console.error("Failed to bootstrap Supabase session:", err);
    } finally {
      setIsBooting(false);
    }
  };

  const loadWorkspaceData = async (token: string, user: User) => {
    try {
      // Parallelize workspace fetches
      const [docsRes, progRes] = await Promise.all([
        fetch("/api/documents", { headers: { "Authorization": token } }),
        fetch("/api/progress/me", { headers: { "Authorization": token } })
      ]);

      let docs: Document[] = [];
      if (docsRes.ok) {
        docs = await docsRes.json();
        setDocuments(docs);
      }

      if (progRes.ok) {
        const userProg: UserProgress = await progRes.json();
        setProgress(userProg);
      }

      // Load all schedules tasks belonging to user's documents
      // In high-fidelity, let's load documents material timelines and gather pending tasks
      const tasksGathered: any[] = [];
      for (const d of docs) {
        const matRes = await fetch(`/api/documents/${d.id}/materials`, { headers: { "Authorization": token } });
        if (matRes.ok) {
          const mat = await matRes.json();
          if (mat.studyPlan) {
            mat.studyPlan.tasks.forEach((t: any) => {
              tasksGathered.push({
                ...t,
                docId: d.id,
                docTitle: d.title
              });
            });
          }
        }
      }
      setUpcomingTasks(tasksGathered.sort((a,b) => a.dayNumber - b.dayNumber));

    } catch (error) {
      console.error("Failed gathering user workspace logs: ", error);
    }
  };

  const loadSupabaseWorkspaceData = async (userId: string, user: User) => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      // 1. Fetch user's uploaded documents
      const { data: docs, error: docError } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", userId);

      if (docError) {
        console.warn("Could not load documents from Supabase yet (Phase 1/2 table setups):", docError);
        const localDocToken = localStorage.getItem("studymate_token");
        if (localDocToken) {
          await loadWorkspaceData(localDocToken, user);
        }
        return;
      }

      let mappedDocs: Document[] = [];
      if (docs) {
        mappedDocs = docs.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          title: d.title || "Untitled Document",
          extractedText: d.extracted_text || "",
          fileType: d.file_type || "txt",
          fileSize: d.file_size || 0,
          createdAt: d.created_at || new Date().toISOString()
        }));
        setDocuments(mappedDocs);
      }

      // 2. Map of doc_id -> title for display labels and timeline lookups
      const docTitleMap: Record<string, string> = {};
      mappedDocs.forEach((d) => {
        docTitleMap[d.id] = d.title;
      });

      // 3. Fetch Leitner review box states for all flashcards belonging to the user's documents
      const flashcardProgress: Record<string, { cardId: string; boxIndex: number; lastReviewed: string }> = {};
      
      if (mappedDocs.length > 0) {
        try {
          const docIds = mappedDocs.map((d) => d.id);
          const { data: flashcardsRows, error: fcErr } = await supabase
            .from("flashcards")
            .select("id, leitner_box, updated_at, created_at")
            .in("document_id", docIds);

          if (!fcErr && flashcardsRows) {
            flashcardsRows.forEach((fc: any) => {
              flashcardProgress[fc.id] = {
                cardId: fc.id,
                boxIndex: fc.leitner_box || 0,
                lastReviewed: fc.updated_at || fc.created_at || new Date().toISOString()
              };
            });
          }
        } catch (fcEx) {
          console.warn("Could not load flashcards progress levels:", fcEx);
        }
      }

      // 4. Load full activity logs from user_progress table
      let progressList: any[] = [];
      let flashcardSessionsCount = 0;
      let totalMasteryRateSum = 0;
      let lastStudiedDocTitle = "";

      try {
        const { data: progressRows, error: progErr } = await supabase
          .from("user_progress")
          .select("*")
          .eq("user_id", userId)
          .order("completed_at", { ascending: false });

        if (!progErr && progressRows && progressRows.length > 0) {
          // Identify last studied document
          const latestProgress = progressRows[0];
          if (latestProgress.document_id && docTitleMap[latestProgress.document_id]) {
            lastStudiedDocTitle = docTitleMap[latestProgress.document_id];
          }

          progressRows.forEach((p: any) => {
            const docTitle = docTitleMap[p.document_id] || "Academic Material";
            const activityDate = p.completed_at || p.created_at || new Date().toISOString();
            
            if (p.activity_type === "flashcards") {
              flashcardSessionsCount++;
              totalMasteryRateSum += p.mastery_rate || 0;
              
              progressList.push({
                quizId: `fc-session-${p.id}`,
                title: `Active Recall: ${docTitle}`,
                score: p.score || p.correct_items || 0,
                maxScore: p.max_score || p.total_items || 10,
                date: activityDate
              });
            } else {
              // "quiz" activity
              progressList.push({
                quizId: p.document_id || `quiz-session-${p.id}`,
                title: `Interactive Quiz: ${docTitle}`,
                score: p.score || p.correct_items || 0,
                maxScore: p.max_score || p.total_items || 10,
                date: activityDate
              });
            }
          });
        }
      } catch (progEx) {
        console.warn("Could not load user_progress logs from Supabase:", progEx);
      }

      // 4b. Fetch actual AI usage counts directly from ai_usage_logs
      let totalAIUsageCount = 0;
      try {
        const { data: aiLogsRows, error: aiLogsErr } = await supabase
          .from("ai_usage_logs")
          .select("id")
          .eq("user_id", userId);
        if (!aiLogsErr && aiLogsRows) {
          totalAIUsageCount = aiLogsRows.length;
        }
      } catch (aiLogsEx) {
        console.warn("Could not load actual ai_usage_logs for progress tracking:", aiLogsEx);
      }

      const avgMasteryRate = flashcardSessionsCount > 0 
        ? Math.round(totalMasteryRateSum / flashcardSessionsCount)
        : 0;

      // 5. Update global app progress state
      setProgress({
        userId,
        quizzes: progressList,
        flashcardProgress,
        totalAIUsage: totalAIUsageCount, // Real counted generator usages!
        lastActive: progressList.length > 0 ? progressList[0].date : new Date().toISOString(),
        // Extra properties for dashboard mapping
        flashcardSessionsCount,
        avgMasteryRate,
        lastStudiedDocTitle
      } as any);

      // 6. Load all interactive study plan tasks belonging to user's documents from Supabase
      const tasksGathered: any[] = [];
      if (mappedDocs.length > 0) {
        try {
          const docIds = mappedDocs.map((d) => d.id);
          const { data: studyPlansRows, error: spErr } = await supabase
            .from("study_plans")
            .select("*")
            .in("document_id", docIds);

          if (!spErr && studyPlansRows) {
            studyPlansRows.forEach((sp: any) => {
              const docTitle = docTitleMap[sp.document_id] || "Academic Material";
              if (Array.isArray(sp.tasks)) {
                sp.tasks.forEach((t: any) => {
                  tasksGathered.push({
                    id: t.id || `task-${Math.random().toString(36).substring(2, 11)}`,
                    day: t.day || t.dayNumber || 1,
                    dayNumber: t.dayNumber || t.day || 1,
                    title: t.title || "Study Task",
                    description: t.description || "",
                    isCompleted: !!(t.isCompleted || t.completed),
                    docId: sp.document_id,
                    docTitle: docTitle
                  });
                });
              }
            });
          }
        } catch (spEx) {
          console.warn("Could not load study plans for user's documents:", spEx);
        }
      }
      setUpcomingTasks(tasksGathered.sort((a, b) => a.dayNumber - b.dayNumber));

    } catch (err) {
      console.error("Failed loading Supabase workspace logs:", err);
    }
  };

  const handleLoginAsGuest = async (email: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        const { token, user } = await res.json();
        localStorage.setItem("studymate_token", token);
        setCurrentUser(user);
        await loadWorkspaceData(token, user);
        setCurrentView(user.role === "admin" ? "admin" : "dashboard");
      }
    } catch (err) {
      console.error(err);
      setErrorBanner("Failed to resolve sandbox login. Please try again.");
    }
  };

  const handleSupabaseLogin = async (email: string, pass: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: pass })
        });
        if (res.ok) {
          const { token, user } = await res.json();
          localStorage.setItem("studymate_token", token);
          setCurrentUser(user);
          await loadWorkspaceData(token, user);
          setCurrentView(user.role === "admin" ? "admin" : "dashboard");
          return {};
        } else {
          const errData = await res.json();
          return { error: errData.error || "Login failed." };
        }
      } catch (err: any) {
        return { error: err.message || "Login failed." };
      }
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pass
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err.message || "Login failed." };
    }
  };

  const handleSupabaseSignUp = async (email: string, pass: string, name: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password: pass })
        });
        if (res.ok) {
          const { token, user } = await res.json();
          localStorage.setItem("studymate_token", token);
          setCurrentUser(user);
          await loadWorkspaceData(token, user);
          setCurrentView(user.role === "admin" ? "admin" : "dashboard");
          return {};
        } else {
          const errData = await res.json();
          return { error: errData.error || "Sign up failed." };
        }
      } catch (err: any) {
        return { error: err.message || "Sign up failed." };
      }
    }
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: {
            full_name: name
          }
        }
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err.message || "Sign up failed." };
    }
  };

  const handleResetPasswordRequest = async (email: string): Promise<{ error?: string; success?: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: "In sandbox mode: password reset request simulated successfully." };
    }
    try {
      const appUrl = (import.meta as any).env.VITE_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/?auth=reset-password`
      });
      if (error) return { error: error.message };
      return { success: "Password reset instructions have been dispatched. Check your email inbox." };
    } catch (err: any) {
      return { error: err.message || "Password recovery request failed." };
    }
  };

  const handleUpdatePassword = async (password: string): Promise<{ error?: string; success?: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.warn(e);
      }
      return { success: "Sandbox password override updated successfully." };
    }
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: error.message };
      
      // Clear URL query/hash so refreshes do not reload the recovery screen
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (historyErr) {
        console.warn("[App:HistoryState] Failed clean recovery url parameters:", historyErr);
      }

      // Force signout to clear state and re-authenticate securely
      await supabase.auth.signOut();
      return { success: "Password updated successfully. Please sign in again." };
    } catch (err: any) {
      return { error: err.message || "Could not update account credentials. Try again." };
    }
  };

  const handleLogoutCleanup = () => {
    setCurrentUser(null);
    setDocuments([]);
    setSelectedDocId(null);
    setSelectedDocMaterials(null);
    setProgress({
      userId: "",
      quizzes: [],
      flashcardProgress: {},
      totalAIUsage: 0,
      lastActive: ""
    });
    setUpcomingTasks([]);
    setCurrentView("home");
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem("studymate_token");
    handleLogoutCleanup();
  };

  const handleSelectRole = async (role: "student" | "admin") => {
    if (!currentUser) return;

    if (currentUser.role !== "admin") {
      setErrorBanner("Access denied: Only administrators can modify profile roles.");
      return;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ role })
          .eq("id", currentUser.id);

        if (!error) {
          const updated = { ...currentUser, role };
          setCurrentUser(updated);
          setCurrentView(role === "admin" ? "admin" : "dashboard");
          await loadSupabaseWorkspaceData(currentUser.id, updated);
        } else {
          console.error("Failed setting role to profiles table:", error);
          setErrorBanner("Access denied: Supabase prevented your role update.");
        }
      } catch (err: any) {
        console.error(err);
        setErrorBanner("Access denied: " + err.message);
      }
    } else {
      try {
        const res = await fetch(`/api/admin/users/${currentUser.id}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": currentUser.id },
          body: JSON.stringify({ role })
        });
        if (res.ok) {
          const updated = { ...currentUser, role };
          setCurrentUser(updated);
          setCurrentView(role === "admin" ? "admin" : "dashboard");
          await loadWorkspaceData(currentUser.id, updated);
        } else {
          setErrorBanner("Access denied: Server rejected the simulation role update.");
        }
      } catch (err: any) {
        console.error(err);
        setErrorBanner("Access denied: Failed to contact the backend server.");
      }
    }
  };

  const handleUpgradePremiumDemo = async () => {
    if (!currentUser) return;
    setErrorBanner(null);
    setSuccessBanner(null);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        
        if (sessionErr || !session) {
          setErrorBanner("No active session. Please log in again.");
          return;
        }

        console.log("[handleUpgradePremiumDemo] Invoking upgrade-premium Edge Function...");
        const { data, error } = await supabase.functions.invoke("upgrade-premium", {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (error) {
          console.error("[handleUpgradePremiumDemo:execute-error] upgrade-premium function failed:", error);
          let detailMsg = error.message;
          try {
            const ctxResponse = (error as any).context;
            const clonedResponse = typeof ctxResponse?.clone === "function" ? ctxResponse.clone() : ctxResponse;
            const errorPayload = await clonedResponse.json();
            if (errorPayload && errorPayload.error) {
              detailMsg = errorPayload.error + (errorPayload.details ? ` (${errorPayload.details})` : "");
            }
          } catch (e) {
            // Context parsing was not JSON
          }
          throw new Error(detailMsg);
        }

        console.log("[handleUpgradePremiumDemo:success] Completed edge update:", data);
        
        // Re-fetch current profile from public.profiles by auth user id
        console.log("[handleUpgradePremiumDemo] Re-fetching current profile from public.profiles table...");
        const { data: fetchedProfile, error: profileFetchErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single();

        if (profileFetchErr) {
          console.warn("[handleUpgradePremiumDemo] Re-fetch profile from public.profiles returned error:", profileFetchErr);
        }

        const finalProfile = fetchedProfile || data?.profile;
        const isPremiumActive = finalProfile?.is_premium ?? true;

        // Sync state back to client interface immediately
        const updatedUser: User = { 
          ...currentUser, 
          subscription: isPremiumActive ? "premium" : "free",
          name: finalProfile?.full_name || currentUser.name,
          role: (finalProfile?.role || currentUser.role) as "student" | "admin"
        };
        console.log("[handleUpgradePremiumDemo] Applying updatedUser client state:", updatedUser);
        setCurrentUser(updatedUser);
        await loadSupabaseWorkspaceData(currentUser.id, updatedUser);
        setSuccessBanner("Premium activated for demo.");
      } catch (err: any) {
        console.warn("[handleUpgradePremiumDemo:supabase-failure] Supabase Edge Function premium upgrade failed. Using backup local express route...", err);
        
        try {
          const res = await fetch("/api/users/upgrade-premium", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": currentUser.id
            }
          });
          
          if (!res.ok) {
            const fallbackBody = await res.json().catch(() => ({}));
            throw new Error(fallbackBody.error || "Server rejected local simulation tier upgrade.");
          }

          // Re-fetch profiles in case local update had some side-effects
          const { data: fetchedProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single();

          const isPremiumActive = fetchedProfile ? fetchedProfile.is_premium : true;

          const updatedUser: User = { 
            ...currentUser, 
            subscription: isPremiumActive ? "premium" : "free",
            name: fetchedProfile?.full_name || currentUser.name,
            role: (fetchedProfile?.role || currentUser.role) as "student" | "admin"
          };
          setCurrentUser(updatedUser);
          await loadSupabaseWorkspaceData(currentUser.id, updatedUser);
          setSuccessBanner("Premium activated for demo.");
        } catch (fallbackErr: any) {
          console.error("[handleUpgradePremiumDemo:fatal] Both primary edge client AND local backup routes failed:", fallbackErr);
          setErrorBanner("Failed to upgrade account: " + err.message);
        }
      }
    } else {
      // Local Database mock operation
      try {
        const res = await fetch("/api/users/upgrade-premium", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": currentUser.id
          }
        });
        
        if (!res.ok) {
          const fallbackBody = await res.json().catch(() => ({}));
          throw new Error(fallbackBody.error || "Server rejected premium upgrade.");
        }

        const updatedUser = { ...currentUser, subscription: "premium" };
        setCurrentUser(updatedUser);
        await loadWorkspaceData(currentUser.id, updatedUser);
        setSuccessBanner("Premium activated for demo.");
      } catch (err: any) {
        console.error("[handleUpgradePremiumDemo:local-error] Failed sandbox server update:", err);
        setErrorBanner("Failed to upgrade account: " + err.message);
      }
    }
  };

  const handleUpgradePayos = async () => {
    if (!currentUser) return;
    setErrorBanner(null);
    setSuccessBanner(null);

    if (isSupabaseConfigured && supabase) {
      try {
        setSuccessBanner("Creating your VietQR / Bank Transfer payment checkout...");
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        
        if (sessionErr || !session) {
          setErrorBanner("No active session. Please log in again.");
          return;
        }

        console.log("[payOS] Invoking create-payos-payment Edge Function...");
        const siteUrl = window.location.origin;
        const returnUrl = `${siteUrl}/?payment=success`;
        const cancelUrl = `${siteUrl}/?payment=cancel`;

        const { data, error } = await supabase.functions.invoke("create-payos-payment", {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          },
          body: {
            site_url: siteUrl,
            siteUrl: siteUrl,
            origin: siteUrl,
            returnUrl: returnUrl,
            return_url: returnUrl,
            cancelUrl: cancelUrl,
            cancel_url: cancelUrl
          }
        });

        if (error) {
          console.error("[payOS:execute-error] create-payos-payment function failed:", error);
          let detailMsg = error.message;
          try {
            const ctxResponse = (error as any).context;
            if (ctxResponse) {
              const clonedResponse = typeof ctxResponse.clone === "function" ? ctxResponse.clone() : ctxResponse;
              const errorText = await clonedResponse.text();
              console.log("[payOS:execute-error] raw error context content:", errorText);
              try {
                const errorPayload = JSON.parse(errorText);
                if (errorPayload && errorPayload.error) {
                  detailMsg = errorPayload.error + (errorPayload.details ? ` (${errorPayload.details})` : "");
                }
              } catch {
                if (errorText) {
                  detailMsg = errorText;
                }
              }
            }
          } catch (e) {
            // Context parsing was not JSON
          }
          throw new Error(detailMsg);
        }

        // Redirect to payOS checkout url
        const checkoutUrl = data?.checkout_url || data?.checkoutUrl;
        if (checkoutUrl) {
          console.log("[payOS] Redirecting to checkout URL:", checkoutUrl);
          window.location.href = checkoutUrl;
        } else {
          console.error("[payOS] No checkout url found in response:", data);
          throw new Error("No payment checkout URL returned from server.");
        }
      } catch (err: any) {
        console.error("[payOS] Checkout generation failed:", err);
        const errMsg = String(err.message || err);
        const isSiteUrlErr = errMsg.includes("SITE_URL") || errMsg.includes("SITE_URL is not configured");

        if (isSiteUrlErr) {
          setErrorBanner(
            <div className="space-y-2 py-1">
              <span className="font-extrabold text-rose-900 block">Failed to initiate VietQR payment: SITE_URL is not configured.</span>
              <p className="text-[11px] text-rose-700 leading-relaxed font-sans">
                Your Supabase Edge Function expects the <code className="bg-rose-100 px-1 py-0.5 rounded font-mono font-bold text-rose-800">SITE_URL</code> secret to be configured for redirection callbacks. Run this command in your project terminal:
              </p>
              <div className="bg-slate-950 text-emerald-450 p-2.5 text-[11px] font-mono rounded-xl border border-slate-800 overflow-x-auto select-all shadow-sm">
                supabase secrets set SITE_URL={window.location.origin}
              </div>
              <p className="text-[10px] text-slate-500 font-sans italic">
                (Double-click inside the box to copy, then run using your Supabase CLI)
              </p>
            </div>
          );
        } else {
          setErrorBanner("Failed to initiate VietQR payment: " + errMsg);
        }
      }
    } else {
      setErrorBanner("VietQR / payOS integration is only supported when Supabase is configured.");
    }
  };

  const handleUpgradeTier = async (tier: "free" | "premium" | "payos") => {
    if (!currentUser) return;

    if (tier === "payos") {
      await handleUpgradePayos();
      return;
    }

    if (tier === "premium") {
      if ((import.meta as any).env?.DEV !== true) {
        setErrorBanner("Sandbox fallback trial is disabled on the production platform. Please use the real VietQR / Bank Transfer checkout option to immediately upgrade your profile.");
        return;
      }
      await handleUpgradePremiumDemo();
      return;
    }

    if (currentUser.role !== "admin") {
      setErrorBanner("Access denied: Only administrators can modify subscription tiers.");
      return;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ is_premium: (tier as string) === "premium" })
          .eq("id", currentUser.id);

        if (!error) {
          const updated = { ...currentUser, subscription: tier };
          setCurrentUser(updated);
          await loadSupabaseWorkspaceData(currentUser.id, updated);
        } else {
          console.error("Failed upgrading user subscription tier in Sys profiles:", error);
          setErrorBanner("Access denied: Supabase prevented your tier update.");
        }
      } catch (err: any) {
        console.error(err);
        setErrorBanner("Access denied: " + err.message);
      }
    } else {
      try {
        const res = await fetch("/api/users/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": currentUser.id },
          body: JSON.stringify({ tier })
        });
        if (res.ok) {
          const updated = { ...currentUser, subscription: tier };
          setCurrentUser(updated);
          await loadWorkspaceData(currentUser.id, updated);
        } else {
          setErrorBanner("Access denied: Server rejected the simulation tier upgrade.");
        }
      } catch (err: any) {
        console.error(err);
        setErrorBanner("Access denied: Failed to contact the backend server.");
      }
    }
  };

  // Document management operations
  const handleUploadTextDocument = async (title: string, content: string, fileObj?: File) => {
    if (isSupabaseConfigured && supabase && currentUser) {
      try {
        const timestamp = Date.now();
        const sanitizedFilename = title.replace(/[^a-zA-Z0-9.-]/g, "_");
        const userId = currentUser.id;
        const uploadedFilePath = `${userId}/${timestamp}-${sanitizedFilename}`;

        const fileToUpload = fileObj || new File([new Blob([content], { type: "text/plain" })], title, { type: "text/plain" });
        const computedSize = fileToUpload.size;
        const computedType = title.split('.').pop() || "txt";

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("study-documents")
          .upload(uploadedFilePath, fileToUpload, {
            cacheControl: "3600",
            upsert: true
          });

        if (uploadError) {
          console.error("Supabase Storage Upload Error:", uploadError);
          throw new Error("Failed to upload document file to Supabase Storage: " + uploadError.message);
        }

        const { data: insertData, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            title: title,
            file_path: uploadedFilePath,
            file_type: computedType,
            file_size: computedSize,
            extracted_text: content,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          console.error("Supabase Database Insert Error:", insertError);
          throw new Error("Failed to save document metadata in Supabase DB: " + insertError.message);
        }

        const uploadedDoc: Document = {
          id: insertData.id,
          userId: insertData.user_id,
          title: insertData.title || title,
          extractedText: insertData.extracted_text || content || "",
          fileType: insertData.file_type || computedType,
          fileSize: insertData.file_size || computedSize,
          createdAt: insertData.created_at || new Date().toISOString(),
          filePath: insertData.file_path || uploadedFilePath,
        };

        setDocuments((prev) => [uploadedDoc, ...prev]);
        return uploadedDoc;
      } catch (err: any) {
        console.error("Supabase document upload flow failed:", err);
        throw err;
      }
    } else {
      const token = localStorage.getItem("studymate_token") || "";
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token },
        body: JSON.stringify({ title, text: content, fileType: "txt" })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed uploading study guide.");
      }
      const uploaded: Document = await res.json();
      setDocuments((prev) => [uploaded, ...prev]);
      return uploaded;
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      if (isSupabaseConfigured && supabase && currentUser) {
        const docToDelete = documents.find((d) => d.id === docId);
        if (docToDelete && docToDelete.filePath) {
          const { error: storageDelError } = await supabase.storage
            .from("study-documents")
            .remove([docToDelete.filePath]);
          if (storageDelError) {
            console.warn("Could not delete from Supabase storage:", storageDelError);
          }
        }
        const { error: dbDelError } = await supabase
          .from("documents")
          .delete()
          .eq("id", docId);
        if (dbDelError) {
          throw dbDelError;
        }
      } else {
        const token = localStorage.getItem("studymate_token") || "";
        const res = await fetch(`/api/documents/${docId}`, {
          method: "DELETE",
          headers: { "Authorization": token }
        });
        if (!res.ok) {
          throw new Error("Failed deleting document.");
        }
      }
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setUpcomingTasks((prev) => prev.filter((t) => t.docId !== docId));
      if (selectedDocId === docId) {
        setSelectedDocId(null);
        setSelectedDocMaterials(null);
        setCurrentView("dashboard");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadMaterials = async (docId: string) => {
    const token = localStorage.getItem("studymate_token") || "";
    setSelectedDocId(docId);
    try {
      if (isSupabaseConfigured && supabase && currentUser) {
        // Fetch document metadata from database
        const { data: docData, error: dError } = await supabase
          .from("documents")
          .select("*")
          .eq("id", docId)
          .single();

        if (dError || !docData) {
          throw new Error("Document not found in Supabase: " + dError?.message);
        }

        const currentDoc: Document = {
          id: docData.id,
          userId: docData.user_id,
          title: docData.title || "Untitled Document",
          extractedText: docData.extracted_text || "",
          fileType: docData.file_type || "txt",
          fileSize: docData.file_size || 0,
          createdAt: docData.created_at || new Date().toISOString(),
          filePath: docData.file_path,
        };

        // Fetch summary from public.summaries
        const { data: sumData, error: sumError } = await supabase
          .from("summaries")
          .select("*")
          .eq("document_id", docId);
        
        let mappedSummary: Summary | null = null;
        if (sumData && sumData.length > 0) {
          const row = sumData[0];
          mappedSummary = {
            id: row.id,
            documentId: row.document_id || row.documentId,
            overview: row.overview || "",
            keyPoints: Array.isArray(row.key_points) ? row.key_points : (Array.isArray(row.keyPoints) ? row.keyPoints : []),
            summaryText: row.summary_text || row.summaryText || "",
            createdAt: row.created_at || row.createdAt || new Date().toISOString()
          };
        }

        // Safe fetch of other materials (if exist in DB)
        let mappedQuiz = null;
        let mappedFlashcards: any[] = [];
        let mappedStudyPlan = null;

        try {
          const { data: quizData } = await supabase.from("quizzes").select("*").eq("document_id", docId);
          if (quizData && quizData.length > 0) {
            const row = quizData[0];
            
            // Query the questions table associated with this quiz_id
            const { data: questionsData, error: qErr } = await supabase
              .from("questions")
              .select("*")
              .eq("quiz_id", row.id);
            
            if (qErr) {
              console.error("[handleLoadMaterials] Error fetching quiz questions:", qErr);
            }

            let mappedQuestions: any[] = [];
            if (questionsData && Array.isArray(questionsData)) {
              mappedQuestions = questionsData.map((q: any) => {
                let correctAnswerIndex = 0;
                const corrStr = String(q.correct_answer || "A").trim().toUpperCase();
                if (corrStr === "A") correctAnswerIndex = 0;
                else if (corrStr === "B") correctAnswerIndex = 1;
                else if (corrStr === "C") correctAnswerIndex = 2;
                else if (corrStr === "D") correctAnswerIndex = 3;
                else {
                  const parsedInt = parseInt(corrStr, 10);
                  if (!isNaN(parsedInt) && parsedInt >= 0 && parsedInt <= 3) {
                    correctAnswerIndex = parsedInt;
                  }
                }

                const options = [
                  q.option_a || "Option A",
                  q.option_b || "Option B",
                  q.option_c || "Option C",
                  q.option_d || "Option D"
                ];

                return {
                  id: q.id,
                  text: q.question_text || "No question description available",
                  options,
                  correctAnswerIndex,
                  explanation: q.explanation || ""
                };
              });
            }

            console.log("[handleLoadMaterials] Loaded quiz questions:", mappedQuestions);

            mappedQuiz = {
              id: row.id,
              documentId: row.document_id || row.documentId,
              title: row.title || "Subject Quiz",
              questions: mappedQuestions,
              createdAt: row.created_at || row.createdAt || new Date().toISOString()
            };
          }
        } catch (e) {
          console.log("quizzes table access ignored:", e);
        }

        try {
          const { data: fcData } = await supabase.from("flashcards").select("*").eq("document_id", docId);
          if (fcData && Array.isArray(fcData)) {
            mappedFlashcards = fcData.map((row: any) => {
              const rawBox = row.leitner_box !== undefined ? row.leitner_box : (row.box_index !== undefined ? row.box_index : (row.boxIndex !== undefined ? row.boxIndex : 1));
              const box = typeof rawBox === "number" ? rawBox : parseInt(String(rawBox), 10) || 1;
              return {
                id: row.id,
                documentId: row.document_id || row.documentId,
                front: row.front || "",
                back: row.back || "",
                isLearned: box >= 3,
                boxIndex: box,
                createdAt: row.created_at || row.createdAt || new Date().toISOString()
              };
            });
          }
        } catch (e) {
          console.log("flashcards table access ignored:", e);
        }

        try {
          const { data: spData } = await supabase.from("study_plans").select("*").eq("document_id", docId);
          if (spData && spData.length > 0) {
            const row = spData[0];
            mappedStudyPlan = {
              id: row.id,
              documentId: row.document_id || row.documentId,
              title: row.title || "Master Plan",
              durationDays: row.duration_days || row.durationDays || 7,
              tasks: Array.isArray(row.tasks) ? row.tasks : [],
              createdAt: row.created_at || row.createdAt || new Date().toISOString()
            };
          }
        } catch (e) {
          console.log("study_plans table access ignored:", e);
        }

        setSelectedDocMaterials({
          document: currentDoc,
          summary: mappedSummary,
          quiz: mappedQuiz,
          flashcards: mappedFlashcards,
          studyPlan: mappedStudyPlan
        });
        setCurrentView("document-detail");
        return;
      }

      // Local sandbox fallback
      const res = await fetch(`/api/documents/${docId}/materials`, {
        headers: { "Authorization": token }
      });
      if (res.ok) {
        const mats = await res.json();
        setSelectedDocMaterials(mats);
        setCurrentView("document-detail");
      }
    } catch (err) {
      console.error("handleLoadMaterials error:", err);
    }
  };

  // Study plans Checklist Toggle operations
  const handleToggleTask = async (taskId: string) => {
    const token = localStorage.getItem("studymate_token") || "";
    const target = upcomingTasks.find(t => t.id === taskId);
    if (!target) return;
    
    // Optimistic state sync
    const originalState = target.isCompleted;
    const newCompleted = !originalState;

    setUpcomingTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, isCompleted: newCompleted } : t));

    // Update selectedDocMaterials so the DocumentDetailView tab checkbox refreshes in real-time
    if (selectedDocMaterials && selectedDocMaterials.studyPlan && Array.isArray(selectedDocMaterials.studyPlan.tasks)) {
      const updatedTasks = selectedDocMaterials.studyPlan.tasks.map((t: any) => 
        t.id === taskId ? { ...t, isCompleted: newCompleted, completed: newCompleted } : t
      );
      setSelectedDocMaterials({
        ...selectedDocMaterials,
        studyPlan: {
          ...selectedDocMaterials.studyPlan,
          tasks: updatedTasks
        }
      });
    }

    if (isSupabaseConfigured && supabase && currentUser) {
      try {
        console.log("[handleToggleTask] Syncing toggled task item to Supabase:", { taskId, newCompleted });
        
        // Find study plan associated with this document ID
        const { data: spRow, error: fetchErr } = await supabase
          .from("study_plans")
          .select("*")
          .eq("document_id", target.docId)
          .single();

        if (fetchErr || !spRow) {
          throw new Error("Could not find matching study plan row in Supabase: " + fetchErr?.message);
        }

        const tasksList = Array.isArray(spRow.tasks) ? spRow.tasks : [];
        const updatedTasksList = tasksList.map((t: any) => {
          if (t.id === taskId) {
            return {
              ...t,
              isCompleted: newCompleted,
              completed: newCompleted
            };
          }
          return t;
        });

        const { error: updateErr } = await supabase
          .from("study_plans")
          .update({ tasks: updatedTasksList })
          .eq("id", spRow.id);

        if (updateErr) {
          throw updateErr;
        }

        console.log("[handleToggleTask] Successfully updated Supabase study plans list!");
      } catch (err) {
        console.error("[handleToggleTask] Supabase task update failed:", err);
        // Revert UI states
        setUpcomingTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, isCompleted: originalState } : t));
        if (selectedDocMaterials && selectedDocMaterials.studyPlan && Array.isArray(selectedDocMaterials.studyPlan.tasks)) {
          const revertedTasks = selectedDocMaterials.studyPlan.tasks.map((t: any) => 
            t.id === taskId ? { ...t, isCompleted: originalState, completed: originalState } : t
          );
          setSelectedDocMaterials({
            ...selectedDocMaterials,
            studyPlan: {
              ...selectedDocMaterials.studyPlan,
              tasks: revertedTasks
            }
          });
        }
      }
      return;
    }

    // Local Sandbox Mode Fallback
    try {
      const res = await fetch(`/api/studyplan/task/${taskId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token },
        body: JSON.stringify({ isCompleted: !originalState })
      });
      if (!res.ok) {
        // Fallback
        setUpcomingTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, isCompleted: originalState } : t));
      }
    } catch (err) {
      setUpcomingTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, isCompleted: originalState } : t));
    }
  };

  // AI Generators execution binders
  const handleAIAction = async (docId: string, endpoint: string) => {
    if (isSupabaseConfigured && supabase && currentUser) {
      try {
        console.log(`[handleAIAction] Retrieving current active session for endpoint ${endpoint}...`);
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        
        if (sessionErr || !session) {
          console.error("[handleAIAction] Session error or session missing:", sessionErr);
          throw new Error("No active Supabase session. Please login again.");
        }

        console.log(`[handleAIAction] Triggering Supabase Edge Function: ${endpoint} for document: ${docId}`);
        const { data, error } = await supabase.functions.invoke(endpoint, {
          body: { documentId: docId, docId: docId },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });
        
        if (error) {
          console.error(`Supabase Edge Function invoke failed for ${endpoint}:`, error);
          let detailMsg = error.message;
          if ((error as any).context) {
            try {
              // Extract structured JSON error and details payload from response context
              const ctxResponse = (error as any).context;
              const clonedResponse = typeof ctxResponse.clone === "function" ? ctxResponse.clone() : ctxResponse;
              const errorPayload = await clonedResponse.json();
              if (errorPayload && errorPayload.error) {
                detailMsg = errorPayload.error + (errorPayload.details ? `: ${errorPayload.details}` : "");
              } else {
                const textFallback = await clonedResponse.text();
                if (textFallback) detailMsg = textFallback;
              }
            } catch (e) {
              console.warn("[handleAIAction] Could not parse detailed error payload from context:", e);
            }
          }
          throw new Error(detailMsg || "Edge Function returned an error status.");
        }

        if (data && data.error) {
          throw new Error(data.error + (data.details ? `: ${data.details}` : ""));
        }
        
        // Reload items on success to refresh the active materials UI
        console.log(`[handleAIAction] Edge Function finished successfully, reloading materials for ${docId}`);
        await handleLoadMaterials(docId);
        if (currentUser) {
          await loadSupabaseWorkspaceData(currentUser.id, currentUser);
        }
        return;
      } catch (err: any) {
        console.warn(`[handleAIAction] Supabase Edge Function ${endpoint} failed. Attempting local Express generator fallback for document ${docId}. Error details:`, err);
        
        try {
          // Find document in local state to supply raw text input to local Express backup
          const matchingDoc = documents.find(d => d.id === docId);
          const title = matchingDoc?.title || "Study Material";
          const extractedText = matchingDoc?.extractedText || "";

          // Local Express Fallback API request using current user's profile ID as the token
          const token = currentUser.id;
          const res = await fetch(`/api/documents/${docId}/${endpoint}`, {
            method: "POST",
            headers: { 
              "Authorization": token,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title,
              extractedText
            })
          });
          
          if (!res.ok) {
            const fallbackErr = await res.json();
            throw new Error(fallbackErr.error || "Failed AI evaluation via fallback backend.");
          }
          
          const fallbackData = await res.json();
          console.log(`[handleAIAction:fallback-success] Local generator generated content via backup server:`, fallbackData);
          
          // Sync generated data back to the live Supabase tables to keep the database fresh
          if (endpoint === "generate-summary") {
            const overview = fallbackData.overview || "";
            const key_points = fallbackData.keyPoints || [];
            const summary_text = fallbackData.summaryText || "";
            
            console.log("[handleAIAction:fallback-sync] Syncing generated summary to Supabase...");
            const { error: upsertErr } = await supabase
              .from("summaries")
              .upsert({
                document_id: docId,
                overview,
                key_points,
                summary_text,
                created_at: new Date().toISOString()
              }, { onConflict: 'document_id' });
              
            if (upsertErr) {
              console.error("[handleAIAction:fallback-sync-error] Failed sync summary to Supabase:", upsertErr);
            }
          } else if (endpoint === "generate-flashcards") {
            console.log("[handleAIAction:fallback-sync] Syncing generated flashcards to Supabase...");
            // Clear old flashcards
            await supabase.from("flashcards").delete().eq("document_id", docId);
            
            const listToInsert = (Array.isArray(fallbackData) ? fallbackData : []).map((c: any) => ({
              document_id: docId,
              front: String(c.front || "").trim(),
              back: String(c.back || "").trim(),
              leitner_box: 1,
              created_at: new Date().toISOString()
            }));
            
            if (listToInsert.length > 0) {
              const { error: insertErr } = await supabase
                .from("flashcards")
                .insert(listToInsert);
                
              if (insertErr) {
                console.error("[handleAIAction:fallback-sync-error] Failed sync flashcards to Supabase:", insertErr);
              }
            }
          } else if (endpoint === "generate-quiz") {
            console.log("[handleAIAction:fallback-sync] Syncing generated quiz to Supabase...");
            const generatedQuiz = fallbackData; // returns { id, documentId, title, questions, createdAt }
            const arrayQuestions = Array.isArray(generatedQuiz.questions) ? generatedQuiz.questions : [];
            
            // Delete old quiz and associated questions
            const { data: oldQuizzes } = await supabase
              .from("quizzes")
              .select("id")
              .eq("document_id", docId);
              
            if (oldQuizzes && oldQuizzes.length > 0) {
              const oldQuizIds = oldQuizzes.map(q => q.id);
              await supabase.from("questions").delete().in("quiz_id", oldQuizIds);
            }
            
            await supabase
              .from("quizzes")
              .delete()
              .eq("document_id", docId);
              
            const { data: newQuiz, error: insertQuizErr } = await supabase
              .from("quizzes")
              .insert({
                document_id: docId,
                title: generatedQuiz.title || "Practice Quiz",
                created_at: new Date().toISOString()
              })
              .select()
              .single();
              
            if (insertQuizErr || !newQuiz) {
              console.error("[handleAIAction:fallback-sync-error] Failed sync quiz header:", insertQuizErr);
            } else {
              const questionsToInsert = arrayQuestions.map((q: any) => {
                let correct = String(q.correctAnswerIndex !== undefined ? q.correctAnswerIndex : "0");
                if (correct === "0" || correct === "A") correct = "A";
                else if (correct === "1" || correct === "B") correct = "B";
                else if (correct === "2" || correct === "C") correct = "C";
                else if (correct === "3" || correct === "D") correct = "D";
                else correct = "A";
                
                let optA = q.options?.[0] || q.option_a || "Option A";
                let optB = q.options?.[1] || q.option_b || "Option B";
                let optC = q.options?.[2] || q.option_c || "Option C";
                let optD = q.options?.[3] || q.option_d || "Option D";
                
                return {
                  quiz_id: newQuiz.id,
                  question_text: String(q.text || q.question_text || "Question prompt").trim(),
                  option_a: optA,
                  option_b: optB,
                  option_c: optC,
                  option_d: optD,
                  correct_answer: correct,
                  explanation: q.explanation || "",
                  created_at: new Date().toISOString()
                };
              });
              
              if (questionsToInsert.length > 0) {
                const { error: insertQuestionsErr } = await supabase
                  .from("questions")
                  .insert(questionsToInsert);
                  
                if (insertQuestionsErr) {
                  console.error("[handleAIAction:fallback-sync-error] Failed sync quiz questions:", insertQuestionsErr);
                }
              }
            }
          } else if (endpoint === "generate-studyplan") {
            console.log("[handleAIAction:fallback-sync] Syncing generated study plan to Supabase...");
            const generatedPlan = fallbackData; // { id, documentId, title, durationDays, tasks, createdAt }
            
            await supabase
              .from("study_plans")
              .delete()
              .eq("document_id", docId)
              .eq("user_id", currentUser.id);
              
            const cleanTasks = (Array.isArray(generatedPlan.tasks) ? generatedPlan.tasks : []).map((t: any) => ({
              id: t.id || `task-${Math.random().toString(36).substr(2, 9)}`,
              day: Number(t.day || t.dayNumber || 1),
              dayNumber: Number(t.dayNumber || t.day || 1),
              title: String(t.title || `Study Focus Material`).trim(),
              description: String(t.description || "Review assigned parts and master learning materials.").trim(),
              estimated_minutes: Number(t.estimatedMinutes || t.estimated_minutes || 30),
              completed: !!(t.completed || t.isCompleted),
              isCompleted: !!(t.isCompleted || t.completed)
            }));
            
            const { error: insertErr } = await supabase
              .from("study_plans")
              .insert({
                user_id: currentUser.id,
                document_id: docId,
                title: generatedPlan.title || "7-Day Study Plan",
                duration_days: Number(generatedPlan.durationDays || 7),
                tasks: cleanTasks,
                created_at: new Date().toISOString()
              });
              
            if (insertErr) {
              console.error("[handleAIAction:fallback-sync-error] Failed sync study plan:", insertErr);
            }
          }
          
          // Reload items on success to refresh the active materials UI
          console.log(`[handleAIAction] Fallback generator completed successfully, reloading materials for ${docId}`);
          await handleLoadMaterials(docId);
          if (currentUser) {
            await loadSupabaseWorkspaceData(currentUser.id, currentUser);
          }
          return;
        } catch (fallbackError: any) {
          console.error(`[handleAIAction] Primary Edge connection AND local backup generation BOTH failed. Propagating core error to user. Backup error:`, fallbackError);
          throw err;
        }
      }
    }

    const token = localStorage.getItem("studymate_token") || "";
    const res = await fetch(`/api/documents/${docId}/${endpoint}`, {
      method: "POST",
      headers: { "Authorization": token }
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed AI evaluation. Limit may be exceeded.");
    }
    
    // Reload items on success
    await handleLoadMaterials(docId);
    if (currentUser) {
      await loadWorkspaceData(token, currentUser);
    }
  };

  const handleSendChatMessage = async (message: string, chatHistory: any[]) => {
    const token = currentUser?.id || localStorage.getItem("studymate_token") || "";
    if (!selectedDocId) throw new Error("No active document selected for context.");

    const matchingDoc = documents.find((d) => d.id === selectedDocId);
    const title = matchingDoc?.title || "Study Material";
    const extractedText = matchingDoc?.extractedText || "";

    const res = await fetch(`/api/documents/${selectedDocId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": token },
      body: JSON.stringify({ message, chatHistory, title, extractedText })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "failed chatbot response.");
    }

    const data = await res.json();
    if (currentUser) {
      bootstrapSession(token); // sync AI usage counts
    }
    return data.reply;
  };

  // Quiz score recording
  const handleQuizSaveScore = async (score: number, maxScore: number, wrongQuestions: any[]) => {
    const token = localStorage.getItem("studymate_token") || "";
    if (!selectedDocId) return;

    // Supabase Mode
    if (isSupabaseConfigured && supabase && currentUser) {
      try {
        console.log("[handleQuizSaveScore] Saving quiz scores and completion progress to Supabase...", { score, maxScore });
        const { error } = await supabase
          .from("user_progress")
          .insert({
            user_id: currentUser.id,
            document_id: selectedDocId,
            activity_type: "quiz",
            total_items: maxScore,
            correct_items: score,
            mastery_rate: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
            score: score,
            max_score: maxScore,
            completed_at: new Date().toISOString()
          });

        if (error) {
          console.error("[handleQuizSaveScore] Supabase insert failed:", error);
        } else {
          console.log("[handleQuizSaveScore] Quiz saved successfully to Supabase user_progress!");
          await loadSupabaseWorkspaceData(currentUser.id, currentUser);
        }
      } catch (err) {
        console.error("[handleQuizSaveScore] Supabase score save error:", err);
      }
      return;
    }

    // Local Sandbox Mode Fallback
    try {
      const res = await fetch("/api/progress/quiz/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token },
        body: JSON.stringify({ quizId: selectedDocMaterials?.quiz?.id || "temp-quiz", title: selectedDocMaterials?.quiz?.title || "Exam test", score, maxScore, wrongQuestions })
      });
      if (res.ok) {
        if (currentUser) {
          await loadWorkspaceData(token, currentUser);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Leitner review card rating
  const handleReviewFlashcard = async (cardId: string, isLearned: boolean) => {
    const token = localStorage.getItem("studymate_token") || "";
    
    // Supabase Mode
    if (isSupabaseConfigured && supabase && currentUser) {
      try {
        const currentCard = selectedDocMaterials?.flashcards?.find(f => f.id === cardId);
        if (currentCard) {
          const newBox = isLearned ? Math.min(currentCard.boxIndex + 1, 4) : Math.max(currentCard.boxIndex - 1, 0);
          console.log(`[handleReviewFlashcard] Updating card ${cardId} to box ${newBox} in Supabase...`);
          const { error } = await supabase
            .from("flashcards")
            .update({
              leitner_box: newBox
            })
            .eq("id", cardId);
            
          if (error) {
            console.error("[handleReviewFlashcard] Supabase update fail:", error);
          } else {
            setSelectedDocMaterials(prev => {
              if (!prev || !prev.flashcards) return prev;
              return {
                ...prev,
                flashcards: prev.flashcards.map(fc => fc.id === cardId ? {
                  ...fc,
                  boxIndex: newBox,
                  isLearned: newBox >= 3
                } : fc)
              };
            });
          }
        }
      } catch (err) {
        console.error("[handleReviewFlashcard] Supabase mode error:", err);
      }
      return;
    }

    // Local Sandbox Mode Fallback
    try {
      const res = await fetch("/api/progress/flashcard/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token },
        body: JSON.stringify({ cardId, isLearned })
      });
      if (res.ok) {
        if (currentUser) {
          await loadWorkspaceData(token, currentUser);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save overall flashcard completion progress
  const handleSaveFlashcardProgress = async (stats: {
    totalCards: number;
    gotItCount: number;
    stillLearningCount: number;
    masteryRate: number;
  }) => {
    const token = localStorage.getItem("studymate_token") || "";
    if (!selectedDocId) {
      console.error("[handleSaveFlashcardProgress] No selected document ID found.");
      return false;
    }

    // 1. Supabase Mode
    if (isSupabaseConfigured && supabase && currentUser) {
      try {
        console.log("[handleSaveFlashcardProgress] Saving progress to public.user_progress in Supabase...", stats);
        
        const { error } = await supabase
          .from("user_progress")
          .insert({
            user_id: currentUser.id,
            document_id: selectedDocId,
            activity_type: "flashcards",
            total_items: stats.totalCards,
            correct_items: stats.gotItCount,
            mastery_rate: stats.masteryRate,
            score: stats.gotItCount,
            max_score: stats.totalCards,
            completed_at: new Date().toISOString()
          });

        if (error) {
          console.error("[handleSaveFlashcardProgress] Supabase insert failed:", error);
          throw error;
        }

        console.log("[handleSaveFlashcardProgress] Saved successful in Supabase!");
        
        // Refresh local workspace statistics
        await loadWorkspaceData(token, currentUser);
        return true;
      } catch (err) {
        console.error("[handleSaveFlashcardProgress] Supabase insert error:", err);
        return false;
      }
    }

    // 2. Sandbox Mode (Local Fallback)
    try {
      console.log("[handleSaveFlashcardProgress] Saving progress locally (Sandbox mode fallback)...", stats);
      const localProgressKey = `studymate_progress_${currentUser?.id || "guest"}_${selectedDocId}`;
      const savedSession = {
        activityType: "flashcards",
        totalItems: stats.totalCards,
        correctItems: stats.gotItCount,
        masteryRate: stats.masteryRate,
        score: stats.gotItCount,
        maxScore: stats.totalCards,
        completedAt: new Date().toISOString()
      };
      localStorage.setItem(localProgressKey, JSON.stringify(savedSession));
      
      if (currentUser) {
        await loadWorkspaceData(token, currentUser);
      }
      return true;
    } catch (err) {
      console.error("[handleSaveFlashcardProgress] Local save error:", err);
      return false;
    }
  };

  if (isBooting) {
    return (
      <div className="min-h-screen bg-[#fdfcfb] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient glow backgrounds */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-indigo-100/60 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-blue-100/60 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="glass-effect-card p-8 rounded-[24px] flex flex-col items-center space-y-4 max-w-sm w-full text-center z-10">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl animate-pulse">
            <Loader className="h-8 w-8 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">StudyMate AI</h2>
          <span className="text-xs font-mono font-medium text-slate-500 uppercase tracking-widest">Launching Active Study Terminal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfcfb] flex flex-col justify-between text-gray-800 font-sans relative overflow-hidden">
      {/* Frosted Glass background glowing balls */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-100/50 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute -bottom-40 -right-40 w-[700px] h-[700px] bg-blue-100/50 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-[35%] left-[25%] w-[500px] h-[500px] bg-purple-100/25 rounded-full blur-[120px] pointer-events-none -z-10" />
      
      {/* Dynamic Navigation Bar Component */}
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        onSelectRole={handleSelectRole}
        onUpgradeTier={handleUpgradeTier}
        onNavigate={(view) => {
          setErrorBanner(null);
          setCurrentView(view);
        }}
        currentView={currentView}
      />

      {/* Primary Routing Screen Canvas */}
      <main className="flex-1 z-10">
        
        {/* Error Notification Strip */}
        {errorBanner && (
          <div className="max-w-7xl mx-auto px-4 pt-4">
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4.5 w-4.5 text-rose-600" />
                {errorBanner}
              </span>
              <button onClick={() => setErrorBanner(null)} className="text-[10px] text-rose-500 hover:underline">Dismiss</button>
            </div>
          </div>
        )}

        {/* Success Notification Strip */}
        {successBanner && (
          <div className="max-w-7xl mx-auto px-4 pt-4 animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 animate-bounce" />
                {successBanner}
              </span>
              <button onClick={() => setSuccessBanner(null)} className="text-[10px] text-emerald-600 hover:underline">Dismiss</button>
            </div>
          </div>
        )}

        {currentView === "home" && (
          <HomeView
            currentUser={currentUser}
            onLoginAsGuest={handleLoginAsGuest}
            onNavigate={(view) => setCurrentView(view)}
            onUploadTextDocument={handleUploadTextDocument}
            onSupabaseLogin={handleSupabaseLogin}
            onSupabaseSignUp={handleSupabaseSignUp}
            isResetPasswordMode={isResetPasswordMode}
            onResetPasswordRequest={handleResetPasswordRequest}
            onUpdatePassword={handleUpdatePassword}
            setIsResetPasswordMode={setIsResetPasswordMode}
          />
        )}

        {currentView === "dashboard" && currentUser && (
          <DashboardView
            currentUser={currentUser}
            documents={documents}
            progress={progress}
            upcomingTasks={upcomingTasks}
            onDocumentClick={handleLoadMaterials}
            onDeleteDocument={handleDeleteDocument}
            onToggleTask={handleToggleTask}
            onNavigate={(view) => setCurrentView(view)}
            onUpgradeTier={handleUpgradeTier}
          />
        )}

         {currentView === "document-detail" && selectedDocMaterials && (
          <DocumentDetailView
            document={selectedDocMaterials.document}
            summary={selectedDocMaterials.summary}
            quiz={selectedDocMaterials.quiz}
            flashcards={selectedDocMaterials.flashcards}
            studyPlan={selectedDocMaterials.studyPlan}
            onBack={() => {
              setCurrentView("dashboard");
              setSelectedDocId(null);
              setSelectedDocMaterials(null);
            }}
            onGenerateSummary={(docId) => handleAIAction(docId, "generate-summary")}
            onGenerateQuiz={(docId) => handleAIAction(docId, "generate-quiz")}
            onGenerateFlashcards={(docId) => handleAIAction(docId, "generate-flashcards")}
            onGenerateStudyPlan={(docId) => handleAIAction(docId, "generate-studyplan")}
            onStartQuiz={() => setCurrentView("quiz")}
            onStartFlashcards={() => setCurrentView("flashcards")}
            onNavigateToView={(view) => setCurrentView(view)}
            onSendChatMessage={handleSendChatMessage}
            onToggleTask={handleToggleTask}
          />
        )}

        {currentView === "quiz" && selectedDocMaterials?.quiz && (
          <QuizView
            quiz={selectedDocMaterials.quiz}
            onSaveScore={handleQuizSaveScore}
            onBack={() => setCurrentView("document-detail")}
          />
        )}

        {currentView === "flashcards" && selectedDocMaterials && (
          <FlashcardView
            flashcards={selectedDocMaterials.flashcards}
            onReviewCard={handleReviewFlashcard}
            onSaveProgress={handleSaveFlashcardProgress}
            onBack={() => setCurrentView("document-detail")}
          />
        )}

        {currentView === "admin" && (
          currentUser?.role === "admin" ? (
            <AdminView
              currentUser={currentUser}
              onNavigate={(view) => setCurrentView(view)}
            />
          ) : (
            <div className="max-w-md mx-auto my-12 p-8 bg-red-50/50 border border-red-200/60 rounded-2xl text-center space-y-4 shadow-xs" id="admin-access-denied">
              <AlertCircle className="h-12 w-12 text-red-650 mx-auto animate-pulse" />
              <h3 className="text-lg font-bold text-red-900 font-sans tracking-tight">Access Denied</h3>
              <p className="text-xs text-red-700 leading-relaxed max-w-sm mx-auto font-sans">
                Only enrolled administrators with <code className="bg-red-100/80 px-1 py-0.5 rounded text-red-800 font-mono text-[10px]">profiles.role = 'admin'</code> are authorized to access this administration terminal.
              </p>
              <button 
                onClick={() => setCurrentView("dashboard")} 
                className="inline-flex px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all"
              >
                Return to Dashboard
              </button>
            </div>
          )
        )}
      </main>

      {/* Humble clean structural footer, no unrequested credit indicators */}
      <footer className="bg-white border-t border-gray-100 py-6" id="simple-applet-footer">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">
            StudyMate AI • Full-Stack Sandbox Active Study Terminal
          </p>
        </div>
      </footer>
    </div>
  );
}
