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
import { AlertCircle, Loader } from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<string>("home");
  
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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Authenticate on startup
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
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
        if (event === "SIGNED_IN" && session) {
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

      if (currentView === "home") {
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

      const avgMasteryRate = flashcardSessionsCount > 0 
        ? Math.round(totalMasteryRateSum / flashcardSessionsCount)
        : 0;

      // 5. Update global app progress state
      setProgress({
        userId,
        quizzes: progressList,
        flashcardProgress,
        totalAIUsage: progressList.length, // approximation based on session activity logs
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
        }
      } catch (err) {
        console.error(err);
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
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleUpgradeTier = async (tier: "free" | "premium") => {
    if (!currentUser) return;

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ is_premium: tier === "premium" })
          .eq("id", currentUser.id);

        if (!error) {
          const updated = { ...currentUser, subscription: tier };
          setCurrentUser(updated);
          await loadSupabaseWorkspaceData(currentUser.id, updated);
        } else {
          console.error("Failed upgrading user subscription tier in Sys profiles:", error);
        }
      } catch (err) {
        console.error(err);
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
        }
      } catch (err) {
        console.error(err);
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
        return;
      } catch (err: any) {
        console.error(`Supabase Edge Function ${endpoint} failed:`, err);
        throw err;
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
    const token = localStorage.getItem("studymate_token") || "";
    if (!selectedDocId) throw new Error("No active document selected for context.");

    const res = await fetch(`/api/documents/${selectedDocId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": token },
      body: JSON.stringify({ message, chatHistory })
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

        {currentView === "home" && (
          <HomeView
            currentUser={currentUser}
            onLoginAsGuest={handleLoginAsGuest}
            onNavigate={(view) => setCurrentView(view)}
            onUploadTextDocument={handleUploadTextDocument}
            onSupabaseLogin={handleSupabaseLogin}
            onSupabaseSignUp={handleSupabaseSignUp}
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

        {currentView === "admin" && currentUser?.role === "admin" && (
          <AdminView
            currentUser={currentUser}
            onNavigate={(view) => setCurrentView(view)}
          />
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
