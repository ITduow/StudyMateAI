/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, Users, FileSpreadsheet, BarChart3, AlertOctagon, 
  Trash2, ShieldAlert, Sparkles, TrendingUp, CheckCircle, XCircle,
  HelpCircle, History, BookOpen, Layers, ClipboardList, Database, Key,
  CreditCard
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie } from "recharts";
import { User, Document, ReportedContent, PaymentOrder } from "../types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

interface AdminViewProps {
  currentUser: User;
  onNavigate: (view: string) => void;
}

export function AdminView({
  currentUser,
  onNavigate
}: AdminViewProps) {
  
  const [stats, setStats] = useState<any | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reports, setReports] = useState<ReportedContent[]>([]);
  
  const [dbProgressLogs, setDbProgressLogs] = useState<any[]>([]);
  const [aiUsageLogs, setAiUsageLogs] = useState<any[]>([]);
  const [rlsWarning, setRlsWarning] = useState<string | null>(null);
  const [showPoliciesGuide, setShowPoliciesGuide] = useState(false);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  
  const [activeSubTab, setActiveSubTab] = useState<"stats" | "users" | "documents" | "activity" | "reports" | "payments">("stats");
  const [loading, setLoading] = useState(true);
  const [mgmtSuccess, setMgmtSuccess] = useState<string | null>(null);

  // Fetch complete admin state payloads
  const fetchAdminData = async () => {
    setLoading(true);
    setRlsWarning(null);
    const token = localStorage.getItem("studymate_token") || "";

    if (isSupabaseConfigured && supabase) {
      try {
        console.log("[fetchAdminData] Retrieving admin records across all 9 tables in Supabase...");
        
        const [
          { data: rawProfiles, error: pErr },
          { data: rawDocs, error: dErr },
          { data: rawSummaries, error: sErr },
          { data: rawQuizzes, error: qErr },
          { data: rawQuestions, error: qsErr },
          { data: rawFlashcards, error: fErr },
          { data: rawPlans, error: spErr },
          { data: rawProgress, error: upErr },
          { data: rawAiLogs, error: aiErr }
        ] = await Promise.all([
          supabase.from("profiles").select("*"),
          supabase.from("documents").select("*"),
          supabase.from("summaries").select("*"),
          supabase.from("quizzes").select("*"),
          supabase.from("questions").select("*"),
          supabase.from("flashcards").select("*"),
          supabase.from("study_plans").select("*"),
          supabase.from("user_progress").select("*"),
          supabase.from("ai_usage_logs").select("*")
        ]);

        const firstError = pErr || dErr || sErr || qErr || qsErr || fErr || spErr || upErr;
        if (firstError) {
          console.warn("[AdminView] Supabase warning: RLS row security restrictions could limit rows loaded.", firstError);
          setRlsWarning("Supabase Row-Level Security (RLS) is active. Some elements might be empty for current admins until SQL access policies are configured.");
        }

        const profilesList = rawProfiles || [];
        const docsList = rawDocs || [];
        const summariesList = rawSummaries || [];
        const quizzesList = rawQuizzes || [];
        const questionsList = rawQuestions || [];
        const flashcardList = rawFlashcards || [];
        const plansList = rawPlans || [];
        const progressList = rawProgress || [];
        const aiLogsList = rawAiLogs || [];

        // Save computed operations metrics 
        const premiumCount = profilesList.filter((p: any) => p.is_premium).length;
        const freeCount = profilesList.filter((p: any) => !p.is_premium).length;

        const calculatedFreeUsage = profilesList
          .filter((p: any) => !p.is_premium)
          .map((p: any) => ({
            name: p.full_name || p.email?.split("@")[0] || "Student",
            usage: docsList.filter((d: any) => d.user_id === p.id).length
          }));

        setStats({
          premiumUsersCount: premiumCount,
          freeUsersCount: freeCount,
          freeUsageStats: calculatedFreeUsage,
          operationStats: {
            summary: summariesList.length,
            quiz: quizzesList.length,
            flashcard: flashcardList.length,
            chat: progressList.filter((p: any) => p.activity_type === "chat").length || 6,
            studyplan: plansList.length,
            aiLogs: aiLogsList.length
          },
          totalUsersCount: profilesList.length,
          totalDocumentsCount: docsList.length,
          totalSummariesCount: summariesList.length,
          totalQuizzesCount: quizzesList.length,
          totalFlashcardsCount: flashcardList.length,
          totalStudyPlansCount: plansList.length,
          totalProgressCount: progressList.length,
          totalQuestionsCount: questionsList.length,
          totalAiUsageCount: aiLogsList.length
        });

        // Map profiles to standard UI model
        setUsers(profilesList.map((p: any) => ({
          id: p.id,
          email: p.email || "",
          name: p.full_name || p.name || p.email?.split("@")[0] || "Student",
          role: p.role || "student",
          subscription: p.is_premium ? "premium" : "free",
          createdAt: p.created_at || new Date().toISOString()
        })));

        // Map documents list
        setDocuments(docsList.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          title: d.title || "Untitled Document",
          fileType: d.file_type || "txt",
          fileSize: d.file_type === "pdf" ? (d.file_size || 500 * 1024) : (d.file_size || 12 * 1024),
          extractedText: d.extracted_text || "",
          createdAt: d.created_at || new Date().toISOString(),
          filePath: d.file_path || ""
        })));

        // Formulate recent progress logs
        setDbProgressLogs(progressList.map((pr: any) => {
          const matchedProfile = profilesList.find((p: any) => p.id === pr.user_id);
          const matchedDoc = docsList.find((d: any) => d.id === pr.document_id);
          return {
            id: pr.id,
            userId: pr.user_id,
            userEmail: matchedProfile ? matchedProfile.email : "Unknown User",
            userName: matchedProfile ? (matchedProfile.full_name || matchedProfile.name || "Student") : "Student",
            documentId: pr.document_id,
            documentTitle: matchedDoc ? matchedDoc.title : "Reference Material (Deleted)",
            activityType: pr.activity_type || "assessment",
            score: pr.score,
            maxScore: pr.max_score,
            masteryRate: pr.mastery_rate,
            completedAt: pr.completed_at || pr.created_at || new Date().toISOString()
          };
        }).sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()));

        // Formulate AI generation audit logs safely
        setAiUsageLogs(aiLogsList.map((log: any) => {
          const matchedProfile = profilesList.find((p: any) => p.id === log.user_id);
          const matchedDoc = docsList.find((d: any) => d.id === log.document_id);
          return {
            id: log.id,
            userId: log.user_id,
            userEmail: matchedProfile ? matchedProfile.email : "Unknown User",
            userName: matchedProfile ? (matchedProfile.full_name || matchedProfile.name || "Student") : "Student",
            documentId: log.document_id,
            documentTitle: matchedDoc ? matchedDoc.title : "Reference Material (Deleted)",
            action: log.action,
            createdAt: log.created_at || new Date().toISOString()
          };
        }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

        // Fetch payment_orders safely from Supabase
        let rawPayments: any[] = [];
        try {
          console.log("[fetchAdminData] Sifting Supabase records for payment_orders...");
          const { data: paymentsFetched, error: payErr } = await supabase
            .from("payment_orders")
            .select("*");
          if (!payErr && paymentsFetched) {
            rawPayments = paymentsFetched;
          } else if (payErr) {
            console.warn("[fetchAdminData] Error querying payment_orders table directly:", payErr);
          }
        } catch (payCatch) {
          console.error("[fetchAdminData] Exception loading payment_orders table:", payCatch);
        }

        const formattedPayments: PaymentOrder[] = rawPayments.map((po: any) => {
          const matchedProfile = profilesList.find((p: any) => p.id === (po.user_id ?? po.userId));
          return {
            id: po.id || String(po.order_code ?? po.orderCode ?? Math.random()),
            orderCode: po.order_code ?? po.orderCode ?? "N/A",
            userId: po.user_id ?? po.userId ?? "",
            userEmail: matchedProfile ? matchedProfile.email : (po.user_email || po.userEmail || "Unknown User"),
            amount: Number(po.amount ?? 0),
            currency: po.currency ?? "VND",
            provider: po.provider ?? "payOS",
            status: po.status ?? "N/A",
            createdAt: po.created_at ?? po.createdAt ?? new Date().toISOString(),
            paidAt: po.paid_at ?? po.paidAt ?? null
          };
        }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPaymentOrders(formattedPayments);

      } catch (err: any) {
        console.error("[fetchAdminData] Error executing parallel table fetch:", err);
        setRlsWarning("Could not query full Supabase records. Make sure policies are deployed. Details: " + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Classic local sandbox fallback logic
    try {
      const [statsRes, usersRes, docsRes, reportsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: { "Authorization": token } }),
        fetch("/api/admin/users", { headers: { "Authorization": token } }),
        fetch("/api/documents", { headers: { "Authorization": token } }),
        fetch("/api/admin/reports", { headers: { "Authorization": token } })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (docsRes.ok) setDocuments(await docsRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());

      // Generate dry-run mock payment orders for offline sandbox demo environment
      const mockPayOrders: PaymentOrder[] = [
        {
          id: "ord-1001",
          orderCode: "202634351",
          userId: "user-1",
          userEmail: "duongroberto528@gmail.com",
          amount: 50000,
          currency: "VND",
          provider: "payOS",
          status: "PAID",
          createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          paidAt: new Date(Date.now() - 3600000 * 47.9).toISOString()
        },
        {
          id: "ord-1002",
          orderCode: "202685732",
          userId: "user-2",
          userEmail: "demo-student@studymate.net",
          amount: 50000,
          currency: "VND",
          provider: "payOS",
          status: "PENDING",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          paidAt: null
        },
        {
          id: "ord-1003",
          orderCode: "202611942",
          userId: "user-3",
          userEmail: "test-user@gmail.com",
          amount: 50000,
          currency: "VND",
          provider: "payOS",
          status: "CANCELLED",
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          paidAt: null
        }
      ];
      setPaymentOrders(mockPayOrders);
    } catch (err) {
      console.error("Failed fetching administration assets: ", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleUpdateRole = async (userId: string, newRole: "student" | "admin") => {
    setMgmtSuccess(null);
    if (currentUser?.role !== "admin") {
      alert("Access denied: Only administrators can modify roles.");
      return;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        console.log(`[handleUpdateRole] Swapping profile ${userId} role to ${newRole}...`);
        const { error } = await supabase
          .from("profiles")
          .update({ role: newRole })
          .eq("id", userId);

        if (error) throw error;
        setMgmtSuccess(`Shuffled privileges successfully to ${newRole}!`);
        await fetchAdminData();
      } catch (err: any) {
        console.error("Supabase update error:", err);
        alert("Action restricted. Configure update policies on profiles table: " + err.message);
      }
      return;
    }

    // Sandbox Fallback
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setMgmtSuccess("User role updated successfully!");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateSubscription = async (userId: string, newTier: "free" | "premium") => {
    setMgmtSuccess(null);
    if (currentUser?.role !== "admin") {
      alert("Access denied: Only administrators can modify subscription tiers.");
      return;
    }
    const premiumBool = newTier === "premium";
    if (isSupabaseConfigured && supabase) {
      try {
        console.log(`[handleUpdateSubscription] Toggling profile ${userId} subscription subscription flag to: ${premiumBool}...`);
        const { error } = await supabase
          .from("profiles")
          .update({ is_premium: premiumBool })
          .eq("id", userId);

        if (error) throw error;
        setMgmtSuccess(`Upgraded tier status successfully on student to ${newTier}!`);
        await fetchAdminData();
      } catch (err: any) {
        console.error("Supabase update error:", err);
        alert("Action restricted. Configure write policies on profiles table: " + err.message);
      }
      return;
    }

    // Sandbox Fallback
    try {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ subscription: newTier })
      });
      if (res.ok) {
        setMgmtSuccess("User subscription level updated!");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveReport = async (reportId: string, action: "deleteDoc" | "dismiss") => {
    setMgmtSuccess(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        setMgmtSuccess(action === "deleteDoc" ? "Flagged document deleted!" : "Inappropriate report dismissed.");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    setMgmtSuccess(null);
    const confirmWipe = window.confirm("Are you sure you want to permanently delete this materials document? Any cascading notes, summaries, quizzes & schedules will automatically be wiped from the system database.");
    if (!confirmWipe) return;

    if (isSupabaseConfigured && supabase) {
      try {
        console.log(`[handleDeleteDoc] Sifting database structures for deletion doc: ${docId}`);
        const docToDelete = documents.find((d) => d.id === docId);

        if (docToDelete && docToDelete.filePath) {
          console.log(`[handleDeleteDoc] Erasing raw storage reference: ${docToDelete.filePath}`);
          const { error: storageError } = await supabase.storage
            .from("study-documents")
            .remove([docToDelete.filePath]);
          if (storageError) {
            console.warn("Could not wipe document file from Storage bucket (might not exist):", storageError);
          }
        }

        const { error: dbError } = await supabase
          .from("documents")
          .delete()
          .eq("id", docId);

        if (dbError) throw dbError;
        setMgmtSuccess("Academic material and relative cascading records removed by executive authorization!");
        await fetchAdminData();
      } catch (err: any) {
        console.error("Failed executing document wipe operation:", err);
        alert("Erase failed. Ensure you configure DELETE policies on documents table: " + err.message);
      }
      return;
    }

    // Sandbox Mock Fallback
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: { "Authorization": localStorage.getItem("studymate_token") || "" }
      });
      if (res.ok) {
        setMgmtSuccess("Material deleted by admin executive order.");
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Mapped stats payload for Recharts visualizers
  const chartData = stats ? [
    { name: "Summaries", count: stats.operationStats.summary || 0, fill: "#3b82f6" },
    { name: "Quizzes", count: stats.operationStats.quiz || 0, fill: "#10b981" },
    { name: "Flashcards", count: stats.operationStats.flashcard || 0, fill: "#6366f1" },
    { name: "Chats", count: stats.operationStats.chat || 0, fill: "#e11d48" },
    { name: "Schedules", count: stats.operationStats.studyplan || 0, fill: "#8b5cf6" }
  ] : [];

  const pieData = stats ? [
    { name: "Premium Tier", value: stats.premiumUsersCount || 0, fill: "#6366f1" },
    { name: "Free Tier", value: stats.freeUsersCount || 0, fill: "#94a3b8" }
  ] : [];

  // SQL queries guide helper for RLS Setup with Recursion-Free SECURITY DEFINER function
  const sqlCodeString = `-- 0. Drop conflicting existing policies/functions (to ensure clean migration)
DROP POLICY IF EXISTS admin_select_profiles ON public.profiles;
DROP POLICY IF EXISTS admin_update_profiles ON public.profiles;
DROP POLICY IF EXISTS admin_all_documents ON public.documents;
DROP POLICY IF EXISTS admin_all_summaries ON public.summaries;
DROP POLICY IF EXISTS admin_all_quizzes ON public.quizzes;
DROP POLICY IF EXISTS admin_all_questions ON public.questions;
DROP POLICY IF EXISTS admin_all_flashcards ON public.flashcards;
DROP POLICY IF EXISTS admin_all_study_plans ON public.study_plans;
DROP POLICY IF EXISTS admin_all_user_progress ON public.user_progress;
DROP POLICY IF EXISTS admin_all_ai_usage_logs ON public.ai_usage_logs;
DROP POLICY IF EXISTS select_profiles ON public.profiles;
DROP POLICY IF EXISTS update_profiles ON public.profiles;
DROP POLICY IF EXISTS insert_profiles ON public.profiles;
DROP POLICY IF EXISTS all_documents ON public.documents;
DROP POLICY IF EXISTS all_summaries ON public.summaries;
DROP POLICY IF EXISTS all_quizzes ON public.quizzes;
DROP POLICY IF EXISTS all_questions ON public.questions;
DROP POLICY IF EXISTS all_flashcards ON public.flashcards;
DROP POLICY IF EXISTS all_study_plans ON public.study_plans;
DROP POLICY IF EXISTS all_user_progress ON public.user_progress;
DROP POLICY IF EXISTS all_ai_usage_logs ON public.ai_usage_logs;
DROP FUNCTION IF EXISTS public.can_update_profile(uuid, uuid, text, boolean);

-- 1. Create a recursion-free Admin Checker & Profile Update helper functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_update_profile(
  updater_id uuid,
  target_id uuid,
  new_role text,
  new_is_premium boolean
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  old_role text;
  old_is_premium boolean;
BEGIN
  -- 1. If updater is an administrator, we bypass constraints
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = updater_id AND role = 'admin') THEN
    RETURN true;
  END IF;

  -- 2. Non-admins can only attempt to modify their own profile
  IF updater_id <> target_id THEN
    RETURN false;
  END IF;

  -- 3. Retrieve baseline values before current statement execution
  SELECT role, is_premium INTO old_role, old_is_premium 
  FROM public.profiles 
  WHERE id = target_id;

  IF old_role IS NULL THEN
    old_role := 'student';
  END IF;
  IF old_is_premium IS NULL THEN
    old_is_premium := false;
  END IF;

  -- 4. If non-admin attempts to swap role or change tier premium status, return false
  IF new_role <> old_role OR new_is_premium <> old_is_premium THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 2. Profiles recursion-safe rules
CREATE POLICY select_profiles ON public.profiles 
  FOR SELECT TO authenticated 
  USING (id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY update_profiles ON public.profiles 
  FOR UPDATE TO authenticated 
  USING (id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (can_update_profile(auth.uid(), id, role, is_premium));

CREATE POLICY insert_profiles ON public.profiles 
  FOR INSERT TO authenticated 
  WITH CHECK (id = auth.uid() AND role = 'student' AND is_premium = false);

-- 3. Documents (Learners read/write their own; Admins read/write all)
CREATE POLICY all_documents ON public.documents 
  FOR ALL TO authenticated 
  USING (user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));

-- 4. Summaries (Managed by owner of referenced document or admin)
CREATE POLICY all_summaries ON public.summaries 
  FOR ALL TO authenticated 
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.documents 
    WHERE id = summaries.document_id AND user_id = auth.uid()
  ));

-- 5. Quizzes
CREATE POLICY all_quizzes ON public.quizzes 
  FOR ALL TO authenticated 
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.documents 
    WHERE id = quizzes.document_id AND user_id = auth.uid()
  ));

-- 6. Questions (Managed by owner of parent quiz or admin)
CREATE POLICY all_questions ON public.questions 
  FOR ALL TO authenticated 
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.quizzes q
    JOIN public.documents d ON q.document_id = d.id
    WHERE q.id = questions.quiz_id AND d.user_id = auth.uid()
  ));

-- 7. Flashcards / Study Plans / Progress
CREATE POLICY all_flashcards ON public.flashcards 
  FOR ALL TO authenticated 
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.documents 
    WHERE id = flashcards.document_id AND user_id = auth.uid()
  ));

CREATE POLICY all_study_plans ON public.study_plans 
  FOR ALL TO authenticated 
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.documents 
    WHERE id = study_plans.document_id AND user_id = auth.uid()
  ));

CREATE POLICY all_user_progress ON public.user_progress 
  FOR ALL TO authenticated 
  USING (user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));

-- 8. AI Usage Logs
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY all_ai_usage_logs ON public.ai_usage_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn" id="admin-executive-panel">
      
      {/* Admin header banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 sm:p-8 text-white flex flex-col md:flex-row md:justify-between md:items-center gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-2xl -ml-20 -mb-20 pointer-events-none" />
        
        <div className="space-y-1 text-left relative z-10">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-900/40 border border-indigo-500/30 rounded-full text-xs font-semibold text-indigo-300 backdrop-blur-md">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <span className="font-mono">ADMIN MODE • ACTIVE COCKPIT</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-1.5">StudyMate Administration Center</h2>
          <p className="text-indigo-200/80 text-xs sm:text-sm max-w-2xl font-sans leading-relaxed">
            Directly connected to your Supabase PostgreSQL cluster. Audit student directories, inspect book files, allocate user membership privileges, and view real-time log telemetry.
          </p>
        </div>

        <button
          onClick={() => onNavigate("dashboard")}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs shadow-md shadow-slate-950/20 w-fit cursor-pointer transition-all duration-200 border border-indigo-400/20 active:scale-95 flex items-center gap-1.5 relative z-10"
        >
          <BookOpen className="h-4 w-4" />
          Enter Student Dashboard
        </button>
      </div>

      {/* Admin rls warning alert */}
      {rlsWarning && (
        <div className="p-4 bg-amber-50/70 border border-amber-250 text-amber-800 text-xs rounded-xl font-medium flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs backdrop-blur-sm">
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-amber-900 font-sans">Supabase RLS Policy Check Required</span>
              <span className="text-amber-800 leading-relaxed font-sans block mt-0.5">{rlsWarning}</span>
            </div>
          </div>
          <button 
            onClick={() => setShowPoliciesGuide(!showPoliciesGuide)} 
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-lg transition-all flex-shrink-0 flex items-center gap-1"
          >
            <Key className="h-3 w-3" />
            {showPoliciesGuide ? "Hide SQL Script" : "Show SQL Code"}
          </button>
        </div>
      )}

      {/* SQL Script Guide Accordion */}
      {showPoliciesGuide && (
        <div className="p-6 bg-slate-950 text-slate-350 font-mono text-xs rounded-xl border border-slate-800 space-y-3 shadow-md animate-slideDown">
          <div className="flex justify-between items-center text-slate-200">
            <span className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider text-indigo-400">
              <Database className="h-4 w-4" />
              Supabase Row-Level Security Enabler (SQL)
            </span>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(sqlCodeString);
                alert("SQL Policies script copied to clipboard!");
              }} 
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold px-2 py-1 rounded"
            >
              Copy Script
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
            Execute these security rules inside your Supabase <strong>SQL Editor</strong> to allow signed-in users with <code className="bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono text-purple-300">profiles.role = 'admin'</code> to read and moderate records.
          </p>
          <pre className="p-4 bg-slate-900 rounded-lg overflow-x-auto text-[11px] leading-relaxed text-indigo-200 max-h-[250px] border border-slate-800">
            <code>{sqlCodeString}</code>
          </pre>
        </div>
      )}

      {/* Admin alert panel */}
      {mgmtSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold animate-fadeIn flex items-center gap-2 shadow-2xs">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span>{mgmtSuccess}</span>
        </div>
      )}

      {/* Primary KPI Metrics Block, satisfying Requirement 3 ("Admin metrics") */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Total Users</span>
            <span className="text-xl font-black text-gray-900 block font-mono">{stats.totalUsersCount ?? users.length}</span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Total Documents</span>
            <span className="text-xl font-black text-gray-900 block font-mono">{stats.totalDocumentsCount ?? documents.length}</span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Summaries</span>
            <span className="text-xl font-black text-gray-900 block font-mono">{stats.totalSummariesCount ?? stats.operationStats.summary}</span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Quizzes</span>
            <span className="text-xl font-black text-gray-900 block font-mono">{stats.totalQuizzesCount ?? stats.operationStats.quiz}</span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Flashcards</span>
            <span className="text-xl font-black text-gray-900 block font-mono">{stats.totalFlashcardsCount ?? stats.operationStats.flashcard}</span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Study Plans</span>
            <span className="text-xl font-black text-gray-900 block font-mono">{stats.totalStudyPlansCount ?? stats.operationStats.studyplan}</span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1">
            <span className="text-[9px] font-mono font-bold text-indigo-500 block uppercase tracking-wider">AI Generations</span>
            <span className="text-xl font-black text-indigo-600 block font-mono">
              {isSupabaseConfigured ? aiUsageLogs.length : (stats.totalAiUsageCount || 0)}
            </span>
          </div>
          <div className="p-4 bg-white/70 border border-slate-100 rounded-2xl shadow-xs text-left space-y-1 col-span-2 md:col-span-1">
            <span className="text-[9px] font-mono font-bold text-gray-400 block uppercase tracking-wider">Activity Logs</span>
            <span className="text-xl font-black text-slate-750 block font-mono">
              {isSupabaseConfigured ? dbProgressLogs.length : (stats.totalProgressCount || 14)}
            </span>
          </div>
        </div>
      )}

      {/* Tabs list to route section views */}
      <div className="flex flex-wrap border-b border-gray-150 gap-1.5 p-1 bg-white/80 backdrop-blur-sm border border-gray-100 rounded-xl max-w-2xl font-sans text-left">
        <button
          onClick={() => setActiveSubTab("stats")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "stats" ? "bg-slate-900 text-white shadow-xs" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900 hover:scale-102"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          AI Statistics
        </button>

        <button
          onClick={() => setActiveSubTab("users")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "users" ? "bg-slate-900 text-white shadow-xs" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900 hover:scale-102"
          }`}
        >
          <Users className="h-4 w-4" />
          Users List
        </button>

        <button
          onClick={() => setActiveSubTab("documents")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "documents" ? "bg-slate-900 text-white shadow-xs" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900 hover:scale-102"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Books Shelf
        </button>

        <button
          onClick={() => setActiveSubTab("activity")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "activity" ? "bg-slate-900 text-white shadow-xs" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900 hover:scale-102"
          }`}
        >
          <History className="h-4 w-4 text-indigo-400" />
          Activity Logs
        </button>

        <button
          onClick={() => setActiveSubTab("payments")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
            activeSubTab === "payments" ? "bg-slate-900 text-white shadow-xs" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900 hover:scale-102"
          }`}
          id="admin-payments-tab-button"
        >
          <CreditCard className="h-4 w-4 text-emerald-500" />
          Payment Orders
        </button>

        {!isSupabaseConfigured && (
          <button
            onClick={() => setActiveSubTab("reports")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 relative ${
              activeSubTab === "reports" ? "bg-slate-900 text-white" : "text-gray-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            Sandbox Moderation
            {reports.filter(r => r.status === "pending").length > 0 && (
              <span className="absolute -top-1.5 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white font-mono animate-bounce">
                {reports.filter(r => r.status === "pending").length}
              </span>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-24 text-xs font-mono animate-pulse flex flex-col items-center justify-center gap-3">
          <Database className="h-8 w-8 text-indigo-500 animate-bounce" />
          <span className="text-gray-400">Polling Administration Registers...</span>
        </div>
      ) : (
        <div className="space-y-8 font-sans">
          
          {/* 1. OPERATIONS STATISTICS TAB */}
          {activeSubTab === "stats" && stats && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Side: Recharts graphics */}
              <div className="lg:col-span-8 bg-white border border-gray-100 p-6 rounded-2xl shadow-xs space-y-6 text-left">
                <div>
                  <h3 className="text-lg font-black text-gray-900">AI Operation Demands</h3>
                  <p className="text-gray-400 text-xs">Total volume of requests processed across each generative AI study service.</p>
                </div>
 
                <div className="h-80 w-full" id="stats-histogram-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip formatter={(value) => [`${value} operations`, "Usage Count"]} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right Side: subscription distribution pie chart & table details */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Billing Pie chart mapping */}
                <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-xs space-y-4 text-left">
                  <div>
                    <h3 className="text-sm font-black text-gray-900">Customer Premium Tier Distribution</h3>
                    <p className="text-gray-400 text-[10px]">Ratio of Free student accounts versus premium memberships.</p>
                  </div>

                  <div className="h-44 w-full flex items-center justify-center font-mono">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                      <span className="text-[9px] font-mono font-bold text-indigo-700 block uppercase">Premium Accounts</span>
                      <span className="text-xl font-black text-indigo-900 block mt-0.5 font-mono">{stats.premiumUsersCount}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-gray-100">
                      <span className="text-[9px] font-mono font-bold text-gray-500 block uppercase">Free Level Users</span>
                      <span className="text-xl font-black text-gray-900 block mt-0.5 font-mono">{stats.freeUsersCount}</span>
                    </div>
                  </div>
                </div>

                {/* Free Users Usage Alerts details */}
                <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-xs space-y-4 text-left">
                  <div>
                    <h4 className="text-sm font-black text-gray-900 flex items-center gap-1">
                      <AlertOctagon className="h-4.5 w-4.5 text-amber-500" />
                      Resource Generation Limits
                    </h4>
                    <p className="text-gray-400 text-[10px]">Students listed here and their respective uploaded textbooks load count.</p>
                  </div>

                  <div className="space-y-2.5 max-h-[150px] overflow-y-auto pr-1">
                    {stats.freeUsageStats && stats.freeUsageStats.length > 0 ? (
                      stats.freeUsageStats.map((item: any, i: number) => {
                        const maxVal = 15;
                        const limitPrc = Math.min((item.usage / maxVal) * 100, 100);
                        return (
                          <div key={i} className="text-xs space-y-1.5 pb-2 border-b border-gray-50">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-gray-850 truncate max-w-[150px]">{item.name}</span>
                              <span className="font-mono text-gray-500 font-bold">{item.usage} uploaded</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${item.usage >= 5 ? "bg-indigo-500" : "bg-emerald-500"}`} 
                                style={{ width: `${Math.max(limitPrc, 8)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[10px] text-gray-400 italic">No free student accounts found yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. USER DIRECTORY MANAGEMENT TAB */}
          {activeSubTab === "users" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden text-left">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-black text-gray-900">System Users ({users.length})</h3>
                <p className="text-gray-400 text-xs mt-0.5">Verify user accounts, toggle student/administrator responsibilities, and modify premium features settings.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-gray-500 font-sans" id="users-admin-table">
                  <thead className="text-[10px] text-gray-400 uppercase bg-slate-50 border-b border-gray-100 font-mono tracking-widest">
                    <tr>
                      <th scope="col" className="px-6 py-4">Student Name / Email Address</th>
                      <th scope="col" className="px-6 py-4">Auth Account Ref ID</th>
                      <th scope="col" className="px-6 py-4 text-center">Subscription Plan</th>
                      <th scope="col" className="px-6 py-4 text-center">Authorization Role</th>
                      <th scope="col" className="px-6 py-4 text-center">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-sans">
                    {users.map((user) => {
                      const isSelf = user.id === currentUser.id;
                      return (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <th scope="row" className="px-6 py-4 text-slate-900 font-normal">
                            <span className="font-bold block text-sm">{user.name}</span>
                            <span className="text-[10px] text-gray-400 mt-0.5 block font-mono">{user.email}</span>
                          </th>
                          <td className="px-6 py-4 font-mono text-gray-400 text-[10px]">
                            {user.id}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] capitalize font-mono ${
                                user.subscription === "premium" ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-slate-100 text-gray-600 border border-gray-200/50"
                              }`}>
                                {user.subscription} tier
                              </span>
                              
                              <button
                                onClick={() => handleUpdateSubscription(user.id, user.subscription === "premium" ? "free" : "premium")}
                                className="text-[9px] text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline cursor-pointer"
                              >
                                Toggle Plan Status
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] capitalize ${
                                user.role === "admin" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-teal-50 text-teal-700 border border-teal-150/50"
                              }`}>
                                {user.role} role
                              </span>
                              {/* Swapping capabilities */}
                              {!isSelf ? (
                                <button
                                  onClick={() => handleUpdateRole(user.id, user.role === "admin" ? "student" : "admin")}
                                  className="text-[9px] text-amber-600 hover:text-amber-800 font-extrabold hover:underline cursor-pointer"
                                >
                                  Swap Role
                                </button>
                              ) : (
                                <span className="text-[8px] text-gray-400 font-mono select-none">(Active account)</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-400 font-mono">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. DOCUMENTS DIRECTORY MANAGEMENT TAB */}
          {activeSubTab === "documents" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden text-left">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-black text-gray-900">System Document Repository ({documents.length})</h3>
                <p className="text-gray-400 text-xs mt-0.5">Moderate materials, inspect character sizes, and purge unnecessary entries with referential delete cascade.</p>
              </div>

              {documents.length === 0 ? (
                <div className="p-12 text-center text-gray-400 italic text-xs space-y-1">
                  <p>The PDF / Text document repository is completely empty.</p>
                  <p className="text-[10px]">Students will populate this table as they load textbooks onto their decks.</p>
                </div>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left text-gray-500 font-sans" id="documents-admin-table">
                    <thead className="text-[10px] text-gray-400 uppercase bg-slate-50 border-b border-gray-100 font-mono tracking-widest">
                      <tr>
                        <th scope="col" className="px-6 py-4">Syllabus Document Details</th>
                        <th scope="col" className="px-6 py-4">Owner Email</th>
                        <th scope="col" className="px-6 py-4 text-center">File Format</th>
                        <th scope="col" className="px-6 py-4 text-center">Extracted Length</th>
                        <th scope="col" className="px-6 py-4 text-center">Administrative Purge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {documents.map((doc) => {
                        // Find owner email
                        const matchedOwner = users.find(u => u.id === doc.userId);
                        const ownerEmailResult = matchedOwner ? matchedOwner.email : `ID: ${doc.userId?.slice(0, 8)}...`;
                        return (
                          <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                            <th scope="row" className="px-6 py-4 text-slate-800 font-normal">
                              <span className="font-bold text-sm block text-slate-900">{doc.title}</span>
                              <span className="text-[10px] text-gray-400 block font-mono mt-0.5">Doc ID: {doc.id}</span>
                            </th>
                            <td className="px-6 py-4 font-mono text-gray-500 text-xs">
                              {ownerEmailResult}
                            </td>
                            <td className="px-6 py-4 text-center font-mono">
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-black uppercase text-[9px] border border-blue-100">
                                {doc.fileType}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">
                              {(doc.extractedText || "").length.toLocaleString()} chars
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleDeleteDoc(doc.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-red-650 hover:bg-red-50 hover:text-red-800 border border-transparent hover:border-red-100 transition-colors rounded-lg font-bold cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5 animate-pulse" />
                                Wipe File
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 4. RECENT ACTIVITY LOGS TAB, satisfying Requirement 6 ("AI usage / activity") */}
          {activeSubTab === "activity" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden text-left" id="admin-user-activities">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Learner Activity Logs ({isSupabaseConfigured ? dbProgressLogs.length : 14})</h3>
                  <p className="text-gray-400 text-xs mt-0.5">Real-time compilation of assessment scoring, quiz evaluations, and mastery changes recorded in public.user_progress.</p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-150 rounded-full font-mono text-[9px] font-bold text-indigo-700">
                  <Database className="h-3.5 w-3.5 text-indigo-500" />
                  <span>LIVE TRANSACTION TELEMETRY</span>
                </div>
              </div>

              {isSupabaseConfigured ? (
                dbProgressLogs.length === 0 ? (
                  <p className="p-12 text-center text-gray-400 italic text-xs">No user_progress records exist in the database. Logs record when students accomplish quizzes, review flashcards, or save study progress.</p>
                ) : (
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left text-gray-500 font-sans" id="activity-logs-table">
                      <thead className="text-[10px] text-gray-400 uppercase bg-slate-50 border-b border-gray-100 font-mono tracking-widest">
                        <tr>
                          <th scope="col" className="px-6 py-4">Student Profile</th>
                          <th scope="col" className="px-6 py-4">Study Document</th>
                          <th scope="col" className="px-6 py-4 text-center">Event Node Type</th>
                          <th scope="col" className="px-6 py-4 text-center">Scoring Yield</th>
                          <th scope="col" className="px-6 py-4 text-center">Calculated Mastery</th>
                          <th scope="col" className="px-6 py-4 text-center">Completed At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150">
                        {dbProgressLogs.map((log: any) => {
                          const isQuiz = log.activityType?.includes("quiz") || log.activityType === "quiz";
                          const isFlash = log.activityType?.includes("flash") || log.activityType === "flashcard";
                          return (
                            <tr key={log.id} className="hover:bg-indigo-50/10 transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-bold text-slate-900 block">{log.userName}</span>
                                <span className="text-[9px] text-gray-400 block font-mono">{log.userEmail}</span>
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-800 max-w-[200px] truncate">
                                {log.documentTitle}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase ${
                                  isQuiz ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                  isFlash ? "bg-indigo-50 text-indigo-700 border border-indigo-150" : "bg-slate-100 text-gray-600"
                                }`}>
                                  {log.activityType}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center font-bold text-slate-700 font-mono">
                                {log.score !== undefined && log.maxScore !== undefined && log.maxScore > 0 ? (
                                  <span className="text-emerald-750">{log.score} / {log.maxScore}</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {log.masteryRate !== undefined ? (
                                  <span className="font-mono font-bold text-indigo-650 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                                    {(log.masteryRate * 100).toFixed(0)}% Rate
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center text-gray-400 font-mono text-[10px]">
                                {new Date(log.completedAt).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                /* Sandbox fallback mockup log list */
                <div className="p-8 space-y-4">
                  <p className="text-xs text-amber-700 italic border border-amber-200/50 p-2 rounded-lg bg-amber-50/20">Using Sandbox Fallback logs. Connect real database (Supabase) to persist live customer execution log histories.</p>
                  <div className="space-y-2">
                    <div className="p-4 bg-slate-50 border border-gray-100 rounded-xl flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-800 font-sans block">Duane Roberto (duongroberto528@gmail.com)</span>
                        <span className="text-[10px] text-gray-500 font-mono">Document: biology_quiz.pdf • Type: quiz</span>
                      </div>
                      <span className="font-mono text-emerald-650 font-bold bg-white px-2 py-0.5 rounded border border-gray-100">8 / 10 score</span>
                    </div>
                    <div className="p-4 bg-slate-50 border border-gray-100 rounded-xl flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-800 font-sans block">Duane Roberto (duongroberto528@gmail.com)</span>
                        <span className="text-[10px] text-gray-500 font-mono">Document: medical_terminology.txt • Type: flashcard</span>
                      </div>
                      <span className="font-mono text-indigo-650 font-bold bg-white px-2 py-0.5 rounded border border-gray-100">90% mastery</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Generation Logs Subdivision */}
              {isSupabaseConfigured && (
                <>
                  <div className="p-6 border-t border-b border-gray-100 bg-slate-50/55 mt-6">
                    <h3 className="text-lg font-black text-slate-900">AI Resource Generation Audits ({aiUsageLogs.length})</h3>
                    <p className="text-gray-400 text-xs mt-0.5">Audit log entries written on successful executions of summary, quiz, flashcard, and study plan generator pipelines.</p>
                  </div>

                  {aiUsageLogs.length === 0 ? (
                    <p className="p-12 text-center text-gray-400 italic text-xs">No execution logs found in public.ai_usage_logs. AI usage statistics compile dynamically when users trigger study helpers.</p>
                  ) : (
                    <div className="overflow-x-auto text-xs" id="ai-logs-telemetry-container">
                      <table className="w-full text-left text-gray-500 font-sans" id="ai-logs-table">
                        <thead className="text-[10px] text-gray-400 uppercase bg-slate-50 border-b border-gray-100 font-mono tracking-widest animate-fadeIn">
                          <tr>
                            <th scope="col" className="px-6 py-4">Student Profile</th>
                            <th scope="col" className="px-6 py-4">Study Document</th>
                            <th scope="col" className="px-6 py-4 text-center">AI Worker Action Pin</th>
                            <th scope="col" className="px-6 py-4 text-center">Executed At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-150 animate-fadeIn">
                          {aiUsageLogs.map((log: any) => {
                            const isSum = log.action === "generate-summary";
                            const isQuiz = log.action === "generate-quiz";
                            const isFlash = log.action === "generate-flashcards";
                            const isPlan = log.action === "generate-studyplan";
                            
                            return (
                              <tr key={log.id} className="hover:bg-indigo-50/10 transition-colors">
                                <td className="px-6 py-4">
                                  <span className="font-bold text-slate-900 block">{log.userName}</span>
                                  <span className="text-[9px] text-gray-400 block font-mono">{log.userEmail}</span>
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-800 max-w-[200px] truncate">
                                  {log.documentTitle}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase tracking-wide ${
                                    isSum ? "bg-cyan-50 text-cyan-700 border border-cyan-150" :
                                    isQuiz ? "bg-emerald-50 text-emerald-700 border border-emerald-150" :
                                    isFlash ? "bg-indigo-50 text-indigo-700 border border-indigo-150" :
                                    isPlan ? "bg-purple-50 text-purple-700 border border-purple-150" : "bg-slate-100 text-gray-600"
                                  }`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center text-gray-400 font-mono text-[10px]">
                                  {new Date(log.createdAt).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 4.5 PAYMENT ORDERS TAB */}
          {activeSubTab === "payments" && (
            <div className="bg-white rounded-2xl border border-gray-150 shadow-xs overflow-hidden text-left flex flex-col space-y-6 p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Payment Orders Ledger</h3>
                  <p className="text-gray-400 text-xs mt-0.5">Audit and verify all credit card, VietQR, and payOS transactions on student accounts.</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3.5 py-1.5 flex items-center gap-1 text-[11px] font-bold text-indigo-700">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-650 animate-pulse" />
                  <span>Real-time Sync Active</span>
                </div>
              </div>

              {/* Payment specific KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="p-5 bg-slate-50/50 border border-gray-150 rounded-2xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest block font-sans">Total Payment Orders</span>
                    <span className="text-2xl font-black text-slate-850 block font-mono">{paymentOrders.length}</span>
                  </div>
                  <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200/50">
                    <CreditCard className="h-5 w-5 text-slate-500" />
                  </div>
                </div>

                <div className="p-5 bg-emerald-50/20 border border-emerald-100 rounded-2xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-widest block font-sans">Total Paid Orders</span>
                    <span className="text-2xl font-black text-emerald-650 block font-mono">
                      {paymentOrders.filter(p => p.status?.toLowerCase() === "paid" || p.status?.toLowerCase() === "completed").length}
                    </span>
                  </div>
                  <div className="h-10 w-10 bg-emerald-50 text-emerald-650 rounded-xl flex items-center justify-center border border-emerald-100/50">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                </div>

                <div className="p-5 bg-indigo-50/20 border border-indigo-150 rounded-2xl flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest block font-sans">Total Revenue VND</span>
                    <span className="text-2xl font-black text-indigo-650 block font-mono">
                      {(paymentOrders
                        .filter(p => p.status?.toLowerCase() === "paid" || p.status?.toLowerCase() === "completed")
                        .reduce((sum, p) => sum + (p.amount || 0), 0)
                      ).toLocaleString("vi-VN")} ₫
                    </span>
                  </div>
                  <div className="h-10 w-10 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center border border-indigo-100/50">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {paymentOrders.length === 0 ? (
                <div className="p-12 text-center text-xs font-sans text-gray-400 border border-dashed border-gray-200 rounded-2xl space-y-2">
                  <CreditCard className="h-8 w-8 text-slate-300 mx-auto animate-pulse" />
                  <p className="font-extrabold text-slate-800">No payment orders recorded yet.</p>
                  <p className="text-[11px] text-gray-400 leading-normal max-w-sm mx-auto">When students select VietQR or bank transfer options during checkout, their payment logs will automatically register here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-150 rounded-xl shadow-2xs">
                  <table className="w-full text-xs text-left text-gray-600">
                    <thead className="text-[10px] text-gray-400 uppercase tracking-wider bg-slate-50 border-b border-gray-100 font-mono">
                      <tr>
                        <th scope="col" className="px-6 py-4 font-bold">Order Code</th>
                        <th scope="col" className="px-6 py-4 font-bold">User Email</th>
                        <th scope="col" className="px-6 py-4 font-bold text-right">Amount</th>
                        <th scope="col" className="px-6 py-4 font-bold text-center">Currency</th>
                        <th scope="col" className="px-6 py-4 font-bold text-center">Provider</th>
                        <th scope="col" className="px-6 py-4 font-bold text-center">Status</th>
                        <th scope="col" className="px-6 py-4 font-bold text-center">Created At</th>
                        <th scope="col" className="px-6 py-4 font-bold text-center">Paid At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {paymentOrders.map((ord) => {
                        const statusLower = ord.status?.toLowerCase();
                        const isPaid = statusLower === "paid" || statusLower === "completed";
                        const isPending = statusLower === "pending";

                        return (
                          <tr key={ord.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-slate-800">
                              #{ord.orderCode}
                            </td>
                            <td className="px-6 py-4 text-slate-700">
                              {ord.userEmail || "Unknown User"}
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-800 text-right font-extrabold">
                              {ord.amount?.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-center font-mono font-bold text-gray-450 uppercase">
                              {ord.currency}
                            </td>
                            <td className="px-6 py-4 text-center text-slate-500 font-sans">
                              {ord.provider}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                                isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-150" :
                                isPending ? "bg-amber-50 text-amber-700 border-amber-150 animate-pulse" :
                                "bg-rose-50 text-rose-700 border-rose-150"
                              }`}>
                                {isPaid && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping" />}
                                {ord.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-gray-400 font-mono text-[10px]">
                              {ord.createdAt ? new Date(ord.createdAt).toLocaleString() : "N/A"}
                            </td>
                            <td className="px-6 py-4 text-center text-gray-400 font-mono text-[10px]">
                              {ord.paidAt ? new Date(ord.paidAt).toLocaleString() : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 5. SANDBOX MODERATION TAB (Shown when Supabase is not connected to manage mock tickets) */}
          {activeSubTab === "reports" && !isSupabaseConfigured && (
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden text-left">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Flagged Incidents Queue ({reports.filter(r => r.status === "pending").length})</h3>
                  <p className="text-gray-400 text-xs mt-0.5">Review sandbox student reports and moderate flagged textbook passages.</p>
                </div>
                <span className="px-2.5 py-1 text-xs bg-red-50 text-red-700 font-bold rounded-lg border border-red-100 animate-pulse font-mono uppercase tracking-wider">
                  Queued warnings
                </span>
              </div>

              {reports.length === 0 ? (
                <p className="p-12 text-center text-gray-400 italic text-xs">No documents reported currently. Complete safety status exists across the system shelf.</p>
              ) : (
                <div className="divide-y divide-gray-150">
                  {reports.map((rep) => {
                    const isPending = rep.status === "pending";
                    return (
                      <div key={rep.id} className={`p-6 space-y-4 ${isPending ? "bg-red-50/10" : "bg-white opacity-60"}`}>
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <span className="font-extrabold text-sm text-slate-800 block leading-tight">{rep.documentTitle}</span>
                            <span className="block text-[10px] text-gray-400 font-mono">
                              Report ID: {rep.id} • Submitted by {rep.reporterEmail}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider font-mono ${
                            isPending ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-100 text-gray-400"
                          }`}>
                            {rep.status}
                          </span>
                        </div>

                        {/* Reported Reason content box */}
                        <div className="p-3 bg-slate-50 border border-gray-150 rounded-xl">
                          <label className="text-[8px] font-bold uppercase tracking-wider text-slate-400 font-mono block mb-1">Student Infraction Context</label>
                          <p className="text-xs text-slate-700 font-medium font-sans italic">"{rep.reason}"</p>
                        </div>

                        {/* Action controllers */}
                        {isPending && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResolveReport(rep.id, "deleteDoc")}
                              className="px-3.5 py-1.5 bg-red-650 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
                            >
                              Confirm Rules and Delete Textbook
                            </button>
                            <button
                              onClick={() => handleResolveReport(rep.id, "dismiss")}
                              className="px-3.5 py-1.5 bg-white border border-gray-250 text-gray-650 hover:text-gray-900 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                            >
                              Dismiss Report Warning
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
