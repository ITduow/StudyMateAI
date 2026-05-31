/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { UploadCloud, FileText, CheckCircle2, BookOpen, Star, HelpCircle, ArrowRight, ClipboardCopy } from "lucide-react";
import { User } from "../types";
import { isSupabaseConfigured } from "../lib/supabase";

interface HomeViewProps {
  currentUser: User | null;
  onLoginAsGuest: (email: string) => void;
  onNavigate: (view: string) => void;
  onUploadTextDocument: (title: string, content: string, fileObj?: File) => Promise<any>;
  onSupabaseLogin?: (email: string, pass: string) => Promise<{ error?: string }>;
  onSupabaseSignUp?: (email: string, pass: string, name: string) => Promise<{ error?: string }>;
}

export function HomeView({
  currentUser,
  onLoginAsGuest,
  onNavigate,
  onUploadTextDocument,
  onSupabaseLogin,
  onSupabaseSignUp
}: HomeViewProps) {
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [fullNameInput, setFullNameInput] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authMsg, setAuthMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isAuthPending, setIsAuthPending] = useState(false);

  const [showDemoSelector, setShowDemoSelector] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // Note writing fallback states
  const [pasteMode, setPasteMode] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customContent, setCustomContent] = useState("");
  
  // Loading and alerts
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const DEMO_PRESETS = [
    {
      title: "Introduction to Artificial Intelligence.txt",
      content: `Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to intelligence of humans and other animals. Active study subfields of AI include machine learning, deep learning, computer vision, natural language processing, and neural network engineering.

At its core, Machine Learning (ML) focuses on the development of algorithms that allow computers to find patterns in training data to make predictions or decisions without being explicitly programmed. Today, Deep Learning mimics human brain connectivity via Multi-Layer Perceptron neural systems, transforming sectors from autonomous shipping grids to smart medical diagnostics.

One primary bottleneck in contemporary AI engineering is training resources, as model parameter counts grow exponentially. Large language models require cluster supercomputing and vast arrays of graphic processors (GPUs) or specialized application integrated chips.`
    },
    {
      title: "Psychology 101: Theories of Human Memory.txt",
      content: `Human memory is complex, involving sensory gateways, encoding, consolidation, and retrieval. Cognitive psychologists categorize memory into three main structures: Short-term memory, working memory, and long-term memory.

1. Short-term Memory (STM): Retains small chunks of data temporarily, typically holding about 7 items (miller's magic number) for under 30 seconds unless actively rehearsed.
2. Working Memory (WM): Relies on the central executive control system to integrate auditory and visual signals to execute processing tasks concurrently.
3. Long-term Memory (LTM): Possesses virtually limitless capacity and stores information indefinitely. It is further divided into:
   - Explicit/Declarative Memory: Semantic facts, general definitions, and episodic memories of real life experiences.
   - Implicit/Procedural Memory: Unconscious skills like playing piano or riding bicycles.`
    }
  ];

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setAuthMsg(null);

    if (onSupabaseLogin && onSupabaseSignUp) {
      if (!passwordInput || passwordInput.length < 6) {
        setAuthMsg({ type: "error", text: "Password must be at least 6 characters." });
        return;
      }
      setIsAuthPending(true);
      try {
        if (authMode === "login") {
          const res = await onSupabaseLogin(emailInput, passwordInput);
          if (res?.error) {
            setAuthMsg({ type: "error", text: res.error });
          } else {
            setAuthMsg({ type: "success", text: "Logged in successfully! Redirecting..." });
          }
        } else {
          if (!fullNameInput.trim()) {
            setAuthMsg({ type: "error", text: "Please enter your full name." });
            setIsAuthPending(false);
            return;
          }
          const res = await onSupabaseSignUp(emailInput, passwordInput, fullNameInput);
          if (res?.error) {
            setAuthMsg({ type: "error", text: res.error });
          } else {
            setAuthMsg({ type: "success", text: isSupabaseConfigured ? "Sign up successful! Please check email or login now." : "Sign up successful! Logging you in..." });
            if (!isSupabaseConfigured) {
              // Automatically sign up logged them in local sandbox
              setAuthMode("login");
            } else {
              setAuthMode("login");
            }
          }
        }
      } catch (err: any) {
        setAuthMsg({ type: "error", text: err.message || "Authentication failed." });
      } finally {
        setIsAuthPending(false);
      }
    } else {
      // Sandbox fallback mode if callbacks are not set up somehow
      onLoginAsGuest(emailInput);
    }
  };

  const loadPresetDoc = async (preset: { title: string; content: string }) => {
    setIsUploading(true);
    try {
      if (!currentUser) {
        // Auto sign in user as a student
        onLoginAsGuest("student@studymate.ai");
      }
      await onUploadTextDocument(preset.title, preset.content);
      setSuccessMsg(`Preset "${preset.title}" successfully loaded! Redirecting to workspace...`);
      setTimeout(() => {
        onNavigate("dashboard");
      }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const loadPdfjs = () => {
    return new Promise<any>((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve((window as any).pdfjsLib);
      };
      script.onerror = () => reject(new Error("Failed to load PDF library."));
      document.head.appendChild(script);
    });
  };

  const extractPdfText = async (file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrBuffer = event.target?.result as ArrayBuffer;
          if (!arrBuffer) {
            reject(new Error("Empty file data buffer."));
            return;
          }
          const pdfjsLib = await loadPdfjs();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrBuffer) });
          const pdf = await loadingTask.promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str || "")
              .join(" ");
            fullText += pageText + "\n";
          }
          resolve(fullText);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileProcess = async (file: File) => {
    setIsUploading(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      if (!currentUser) {
        onLoginAsGuest("student@studymate.ai");
      }

      let text = "";
      if (file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractPdfText(file);
        if (!text || !text.trim()) {
          throw new Error("Could not extract text from this PDF. Please try a text-based PDF or upload TXT.");
        }
      } else {
        // Standard .txt / .md behavior fallback
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || "");
          reader.onerror = () => reject(new Error("Failed reading file."));
          reader.readAsText(file);
        });
      }

      await onUploadTextDocument(file.name, text.trim() || "Empty file content.", file);
      setSuccessMsg(`Document "${file.name}" uploaded successfully! Redirecting...`);
      setTimeout(() => {
        onNavigate("dashboard");
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Could not extract text from this PDF. Please try a text-based PDF or upload TXT.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await handleFileProcess(file);
    }
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await handleFileProcess(file);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle || !customContent) return;
    setIsUploading(true);
    try {
      if (!currentUser) {
        onLoginAsGuest("student@studymate.ai");
      }
      await onUploadTextDocument(
        customTitle.endsWith(".txt") ? customTitle : `${customTitle}.txt`,
        customContent
      );
      setSuccessMsg(`Custom notes saved successfully! Redirecting...`);
      setTimeout(() => {
        onNavigate("dashboard");
      }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20" id="home-view-container">
      {/* Upper Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Pitch Hero Panel */}
        <div className="lg:col-span-7 space-y-6 text-left">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Smart Classroom Study Companion</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight leading-none">
            Study <span className="text-blue-600 underline decoration-blue-200 decoration-wavy">Faster</span> and <span className="text-blue-600">Smarter</span> with Artificial Intelligence
          </h1>
          
          <p className="text-gray-500 text-lg sm:text-xl max-w-2xl leading-relaxed">
            Upload your lecture slides, PDF resources, or exam notes. Let our AI instantly craft summarizing guides, interactive multiple-choice tests, recall flashcards, and step-by-step master plans.
          </p>

          {/* Social Proof */}
          <div className="pt-2 flex items-center gap-6 text-xs text-gray-500 font-medium">
            <div className="flex -space-x-2">
              <span className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center font-bold text-[10px] text-gray-700">A</span>
              <span className="w-8 h-8 rounded-full bg-blue-200 border-2 border-white flex items-center justify-center font-bold text-[10px] text-blue-700">M</span>
              <span className="w-8 h-8 rounded-full bg-emerald-200 border-2 border-white flex items-center justify-center font-bold text-[10px] text-emerald-800">K</span>
            </div>
            <div>
              <div className="flex items-center gap-0.5 text-amber-500 mb-0.5">
                {[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
              </div>
              <span>Trusted by 2,500+ university students worldwide</span>
            </div>
          </div>

          {/* Prompt Buttons */}
          <div className="pt-4 flex flex-wrap gap-4">
            {!currentUser ? (
              <button
                onClick={() => {
                  const el = document.getElementById("auth-form-card");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg hover:shadow-blue-550/20 transition-all flex items-center gap-1 text-sm cursor-pointer"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => onNavigate("dashboard")}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center gap-1 text-sm cursor-pointer"
              >
                Enter My Workspace
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={() => setShowDemoSelector(true)}
              className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-bold border border-gray-200 transition-all text-sm shadow-sm"
              id="try-demo-button"
            >
              Try Demo Textbooks
            </button>
          </div>
        </div>

        {/* Input Widgets Container / Interactive Card */}
        <div className="lg:col-span-5 relative" id="auth-form-card">
          <div className="absolute inset-0 bg-indigo-200/40 rounded-[32px] transform rotate-2 scale-98 -z-10 opacity-70 blur-md pointer-events-none" />
          
          <div className="glass-effect-card rounded-[28px] p-6 sm:p-8 space-y-6 relative overflow-hidden">
            {!currentUser ? (
              // Login Segment
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">
                    {isSupabaseConfigured ? "Supabase Account Gate" : "Access Instantly"}
                  </h3>
                  <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isSupabaseConfigured 
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {isSupabaseConfigured ? "🔓 Supabase Active" : "🛡️ Sandbox Mode"}
                  </span>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed">
                  {isSupabaseConfigured 
                    ? "Create a permanent account or sign in to save study plans, documents, and progress to Supabase Cloud Storage."
                    : "Create a local sandbox profile or sign in to save plans, notes, and study logs directly in this browser session."}
                </p>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthMsg(null);
                    }}
                    className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all ${
                      authMode === "login" ? "bg-white text-slate-900 shadow-3xs" : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthMsg(null);
                    }}
                    className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all ${
                      authMode === "signup" ? "bg-white text-slate-900 shadow-3xs" : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                {authMsg && (
                  <div className={`p-3 text-xs rounded-xl border leading-relaxed ${
                    authMsg.type === "error" 
                      ? "bg-rose-50 border-rose-200 text-rose-800" 
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}>
                    {authMsg.text}
                  </div>
                )}
                
                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  {authMode === "signup" && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 font-mono">Full name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Alex Johnson"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white/60"
                        value={fullNameInput}
                        onChange={(e) => setFullNameInput(e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 font-mono">Your Student Email</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g., student@studymate.ai"
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white/60"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 font-mono">Security Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white/60"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAuthPending}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs tracking-wide uppercase transition-colors shadow-sm cursor-pointer mt-2"
                  >
                    {isAuthPending ? (
                      <span className="flex items-center justify-center gap-1.5">
                        Authenticating...
                      </span>
                    ) : (
                      isSupabaseConfigured
                        ? (authMode === "login" ? "Confirm and sign in" : "Register new account")
                        : (authMode === "login" ? "Launch Sandbox Session" : "Create Sandbox Account")
                    )}
                  </button>
                </form>

                <div className="relative flex items-center justify-center my-3.5">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
                  <span className="relative bg-[#fdfcfb] px-3 text-[9px] uppercase font-bold tracking-wider text-gray-400 font-mono">Sandbox Demo Presets</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onLoginAsGuest("student@studymate.ai")}
                    className="py-2 bg-blue-50/70 hover:bg-blue-100/70 text-blue-700 rounded-lg text-xs font-bold transition-all border border-blue-100/30 text-center cursor-pointer"
                  >
                    Login as Student
                  </button>
                  <button
                    onClick={() => onLoginAsGuest("admin@studymate.ai")}
                    className="py-2 bg-amber-50/70 hover:bg-amber-100/70 text-amber-700 rounded-lg text-xs font-bold transition-all border border-amber-100/30 text-center cursor-pointer"
                  >
                    Login as Admin
                  </button>
                </div>
              </div>
            ) : (
              // Upload Widget Segment (When signed in)
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-extrabold text-gray-900">Upload Study Book</h3>
                  <button
                    onClick={() => setPasteMode(!pasteMode)}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    {pasteMode ? "Switch to File Drag" : "Paste Notes Directly"}
                  </button>
                 {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium animate-pulse">
                    {successMsg}
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium">
                    {errorMsg}
                  </div>
                )}

                {pasteMode ? (
                  /* Custom Notes Paste Form */
                  <form onSubmit={handlePasteSubmit} className="space-y-3">
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Study Topic Title (e.g. Bio 101)"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:border-blue-500 outline-none"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <textarea
                        required
                        rows={4}
                        placeholder="Paste study paragraphs, textbook terms, or exam concepts here..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:border-blue-500 outline-none font-sans"
                        value={customContent}
                        onChange={(e) => setCustomContent(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isUploading}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {isUploading ? "AI Extracting..." : "Submit Material & Generate Tasks"}
                    </button>
                  </form>
                ) : (
                  /* Standard Drag and Drop Uploader */
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                      dragActive ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:border-blue-400 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="file"
                      id="manual-file-chooser"
                      className="hidden"
                      accept=".txt,.md,.pdf"
                      onChange={handleManualUpload}
                    />
                    <label htmlFor="manual-file-chooser" className="cursor-pointer block text-center space-y-3">
                      <div className="mx-auto h-12 w-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                        <UploadCloud className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-700">Drag & Drop Study Textbooks</p>
                        <p className="text-[10px] text-gray-400">Supports (.txt, .md, .pdf) • Up to 10MB</p>
                      </div>
                      <span className="inline-block px-3 py-1 bg-white hover:bg-gray-50 border border-gray-200 text-[10px] font-bold rounded-lg text-gray-600 shadow-2xs">
                        {isUploading ? "Processing..." : "Browse Files"}
                      </span>
                    </label>
                  </div>
                )}
              </div>

                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-2.5">
                  <HelpCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-[10px] text-blue-800 leading-tight">
                    <strong>Demo Note:</strong> Currently signed in as <span className="font-bold underline">{currentUser.email}</span>. Click "Browse Files" or type in "Paste Notes" above to inject new lessons in moments!
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature grid showcase */}
      <div className="mt-24 border-t border-slate-200/40 pt-16">
        <h2 className="text-3xl font-extrabold text-gray-900 text-center tracking-tight mb-1">Engaging AI Integration Inside StudyMate</h2>
        <p className="text-gray-400 text-xs text-center mb-10 max-w-sm mx-auto font-sans">Instant compilation of unstructured raw drafts into highly comprehensive exam learning tracks.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="glass-effect-card glass-effect-card-hover p-6 rounded-2xl space-y-3">
            <span className="inline-flex p-3 bg-violet-50 text-violet-600 rounded-xl">
              <FileText className="h-5 w-5" />
            </span>
            <h4 className="font-bold text-gray-800 text-sm">Deep Overview Summary</h4>
            <p className="text-xs text-slate-500 leading-relaxed">Let AI read entire manuals and formulate neat key point outlines, core abstracts, and formatting markdown.</p>
          </div>

          <div className="glass-effect-card glass-effect-card-hover p-6 rounded-2xl space-y-3">
            <span className="inline-flex p-3 bg-amber-50 text-amber-600 rounded-xl">
              <BookOpen className="h-5 w-5" />
            </span>
            <h4 className="font-bold text-gray-800 text-sm">Interactive Practice Quizzes</h4>
            <p className="text-xs text-slate-500 leading-relaxed">Assess your memory. Solve multiple-choice questions with real-time feedback, correction tallies, and in-depth educational explanations.</p>
          </div>

          <div className="glass-effect-card glass-effect-card-hover p-6 rounded-2xl space-y-3">
            <span className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Star className="h-5 w-5" />
            </span>
            <h4 className="font-bold text-gray-800 text-sm">Self-Study Flip Cards</h4>
            <p className="text-xs text-slate-500 leading-relaxed">Flick open flashcards to study questions or key terms. Supports box indexes to measure memorization over review blocks.</p>
          </div>
        </div>
      </div>

      {/* Demo Selection Overlay Panel */}
      {showDemoSelector && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/70 backdrop-blur-2xl rounded-3xl shadow-2xl max-w-md w-full p-6 border border-white/60 overflow-hidden relative">
            <div className="absolute top-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 w-full" />
            
            <h3 className="text-lg font-extrabold text-slate-900 mb-1">Select a Preset Textbook</h3>
            <p className="text-slate-550 text-xs mb-6">Test the complete AI capability immediately without needing manual file uploads.</p>
            
            <div className="space-y-3" id="demo-presets-container">
              {DEMO_PRESETS.map((preset, index) => (
                <button
                  key={index}
                  onClick={() => loadPresetDoc(preset)}
                  disabled={isUploading}
                  className="w-full p-4 bg-white/50 border border-white/70 rounded-xl hover:border-blue-500 hover:bg-blue-50/30 text-left transition-all flex items-start gap-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-sans"
                >
                  <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-gray-850 block text-xs">{preset.title}</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5 font-mono">{preset.content.length} characters</span>
                    <p className="text-[10px] text-gray-550 line-clamp-1 mt-1 font-sans italic">"{preset.content.slice(0, 100)}..."</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowDemoSelector(false)}
                className="py-1.5 px-3.5 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                id="close-demo-selector"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
