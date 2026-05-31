/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { 
  FileText, ArrowLeft, Brain, HelpCircle, GraduationCap, Calendar, 
  Send, Bot, User, RefreshCw, AlertTriangle, Sparkles, AlertCircle, Bookmark, CheckSquare 
} from "lucide-react";
import { Document, Summary, Quiz, Flashcard, StudyPlan } from "../types";

interface DocumentDetailViewProps {
  document: Document;
  summary: Summary | null;
  quiz: Quiz | null;
  flashcards: Flashcard[];
  studyPlan: StudyPlan | null;
  onBack: () => void;
  onGenerateSummary: (docId: string) => Promise<void>;
  onGenerateQuiz: (docId: string) => Promise<void>;
  onGenerateFlashcards: (docId: string) => Promise<void>;
  onGenerateStudyPlan: (docId: string) => Promise<void>;
  onStartQuiz: () => void;
  onStartFlashcards: () => void;
  onNavigateToView: (view: string) => void;
  onSendChatMessage: (message: string, history: any[]) => Promise<string>;
  onToggleTask?: (taskId: string) => void;
}

export function DocumentDetailView({
  document: doc,
  summary,
  quiz,
  flashcards,
  studyPlan,
  onBack,
  onGenerateSummary,
  onGenerateQuiz,
  onGenerateFlashcards,
  onGenerateStudyPlan,
  onStartQuiz,
  onStartFlashcards,
  onNavigateToView,
  onSendChatMessage,
  onToggleTask
}: DocumentDetailViewProps) {
  
  // Tabs
  const [activeTab, setActiveTab] = useState<"summary" | "quiz" | "flashcards" | "studyplan">("summary");

  // Chat panel states
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; content: string; time: string }[]>([
    { role: "ai", content: `Hi there! I have ingested **${doc.title}**. Ask me any questions, request custom breakdowns, or clarify textbook topics here!`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [reportingDone, setReportingDone] = useState(false);

  // Operation Loader states
  const [generatingTab, setGeneratingTab] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Generators handlers
  const handleGenerate = async (type: "summary" | "quiz" | "flashcards" | "studyplan") => {
    setGeneratingTab(type);
    setOpError(null);
    try {
      if (type === "summary") await onGenerateSummary(doc.id);
      else if (type === "quiz") await onGenerateQuiz(doc.id);
      else if (type === "flashcards") await onGenerateFlashcards(doc.id);
      else if (type === "studyplan") await onGenerateStudyPlan(doc.id);
    } catch (err: any) {
      setOpError(err.message || "Failed to trigger AI generation. Please upgrade or try again.");
    } finally {
      setGeneratingTab(null);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsgText = chatInput.trim();
    setChatInput("");
    
    // Add User message
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages((prev) => [...prev, { role: "user", content: userMsgText, time: timestamp }]);
    setChatLoading(true);

    try {
      // Structure simple history format for server
      const mappedHistory = chatMessages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        content: m.content
      }));

      const reply = await onSendChatMessage(userMsgText, mappedHistory);
      setChatMessages((prev) => [...prev, { role: "ai", content: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "ai", content: "⚠️ " + (err.message || "Failed to reach tutor backend. Please try again."), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason) return;
    try {
      await fetch(`/api/documents/${doc.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": localStorage.getItem("studymate_token") || "" },
        body: JSON.stringify({ reason: reportReason })
      });
      setReportingDone(true);
      setTimeout(() => {
        setIsReporting(false);
        setReportingDone(false);
        setReportReason("");
      }, 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6" id="document-detail-view-container">
      
      {/* Upper Navigation Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center px-3 py-1.5 bg-white text-gray-700 hover:text-blue-600 border border-gray-200 hover:border-blue-100 rounded-lg text-xs font-semibold shadow-2xs transition-colors group cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 mr-1 text-slate-400 group-hover:text-blue-500 transition-colors" />
          Back to Dashboard
        </button>

        {/* Action Flags */}
        <div className="flex space-x-2">
          <button
            onClick={() => setIsReporting(!isReporting)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-100 font-semibold rounded-lg text-xs transition-all"
          >
            Report Material
          </button>
        </div>
      </div>

      {/* Flag Report Popup Form overlay */}
      {isReporting && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 font-sans">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-amber-900">Report Inappropriate Study Material</h4>
              <p className="text-[10px] text-amber-700">Flag structural duplications, errors in AI parsing, or violations to sandbox moderation protocols.</p>
            </div>
          </div>
          
          {reportingDone ? (
            <p className="text-xs font-bold text-emerald-700">Thank you! Flagged incident registered for Admin Review.</p>
          ) : (
            <form onSubmit={handleReportSubmit} className="flex gap-2 items-center">
              <input
                type="text"
                required
                className="flex-1 px-3 py-1.5 bg-white rounded-lg border border-amber-200 outline-none text-xs text-gray-800 placeholder-amber-400"
                placeholder="Brief reason (e.g., duplicates, incorrect content)"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
              >
                Send Report
              </button>
            </form>
          )}
        </div>
      )}

      {/* Main Column Split: Left is AI Content generated tabs, Right is ground chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: 7-col Content Generation Area */}
        <div className="lg:col-span-7 bg-white/70 backdrop-blur-2xl rounded-3xl border border-white/50 shadow-lg overflow-hidden flex flex-col min-h-[550px] relative">
          
          {/* Doc details header */}
          <div className="p-6 bg-white/30 border-b border-white/40 flex items-start gap-3">
            <span className="p-3 bg-blue-100 text-blue-700 rounded-xl mt-0.5">
              <FileText className="h-6 w-6" />
            </span>
            <div className="space-y-0.5 min-w-0">
              <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold uppercase tracking-wider font-mono">textbook guide</span>
              <h3 className="text-lg font-black text-gray-900 truncate tracking-tight">{doc.title}</h3>
              <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest font-mono">
                {doc.extractedText.length} characters parsed
              </p>
            </div>
          </div>

          {/* Tab Selection controller triggers */}
          <div className="flex border-b border-white/30 bg-white/10 p-1.5 font-sans">
            {(["summary", "quiz", "flashcards", "studyplan"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const hasContent = 
                (tab === "summary" && summary) || 
                (tab === "quiz" && quiz) || 
                (tab === "flashcards" && flashcards.length > 0) || 
                (tab === "studyplan" && studyPlan);

              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setOpError(null);
                  }}
                  className={`flex-1 py-3 text-center text-xs font-bold capitalize transition-all border-b-2 rounded-lg ${
                    isActive 
                      ? "border-blue-600 bg-white/40 text-blue-700 shadow-3xs" 
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-white/20"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5 font-sans">
                    {tab === "summary" && <Brain className="h-3.5 w-3.5 text-inherit" />}
                    {tab === "quiz" && <HelpCircle className="h-3.5 w-3.5 text-inherit" />}
                    {tab === "flashcards" && <Bookmark className="h-3.5 w-3.5 text-inherit" />}
                    {tab === "studyplan" && <Calendar className="h-3.5 w-3.5 text-inherit" />}
                    {tab}
                    {hasContent && <span className="inline-block h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Error Alert inside Generator Tab panel */}
          {opError && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{opError}</span>
            </div>
          )}

          {/* Dynamic Active Tab contents */}
          <div className="p-6 flex-1 flex flex-col justify-between">
            {activeTab === "summary" && (
              <div className="space-y-6">
                {summary ? (
                  <div className="space-y-5 animate-fade-in text-left">
                    {/* General Overview block */}
                    <div className="p-4 bg-indigo-50/60 border border-indigo-150/40 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest font-mono">Overview Abstract</span>
                      <p className="text-xs text-indigo-950 leading-relaxed font-sans font-medium">
                        {summary.overview}
                      </p>
                    </div>

                    {/* Key takeaways list bullet points */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Core Takeaway Anchor Facts</span>
                      <ul className="space-y-2.5">
                        {summary.keyPoints.map((pt, i) => (
                          <li key={i} className="flex items-start text-xs text-slate-700 py-1.5 px-3 bg-white/45 border border-white/60 rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.03)]">
                            <span className="mt-1.5 h-1.5 w-1.5 bg-indigo-500 rounded-full mr-2.5 flex-shrink-0 animate-pulse" />
                            <span className="leading-tight">{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Detailed Rich Markdown */}
                    <div className="pt-4 border-t border-slate-205/50 space-y-2 font-sans text-xs text-gray-750 leading-relaxed max-w-none">
                      <span className="text-[10px] font-bold text-gray-450 uppercase tracking-widest block font-mono">Comprehensive Breakdown</span>
                      <div className="bg-white/50 backdrop-blur-xs p-4 rounded-xl border border-white/70 font-sans whitespace-pre-line font-medium text-slate-700 shadow-3xs leading-relaxed">
                        {summary.summaryText}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <span className="inline-flex p-4 bg-blue-50 text-blue-600 rounded-full">
                      <Brain className="h-8 w-8" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Summary Outline Uncreated</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-0.5">Let StudyMate AI compile your raw syllabus contents into comprehensive key takeaway blueprints, abstracts, and detailed guides instantly.</p>
                    </div>
                    <button
                      onClick={() => handleGenerate("summary")}
                      disabled={generatingTab !== null}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      {generatingTab === "summary" ? "Summarizing with Gemini..." : "Generate AI Summary"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "quiz" && (
              <div className="space-y-6">
                {quiz ? (
                  <div className="text-center py-12 space-y-4">
                    <span className="inline-flex p-4 bg-emerald-50 text-emerald-600 rounded-full">
                      <HelpCircle className="h-8 w-8" />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm text-gray-800">{quiz.title}</h4>
                      <p className="text-xs text-gray-450 mt-1">{quiz.questions.length} Exam-Level Multiple-Choice questions generated.</p>
                    </div>
                    <div className="pt-2 flex justify-center gap-3">
                      <button
                        onClick={onStartQuiz}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-md hover:shadow-emerald-500/20 cursor-pointer"
                      >
                        Start Practicing
                      </button>
                      <button
                        onClick={() => handleGenerate("quiz")}
                        disabled={generatingTab !== null}
                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-inherit" />
                        Re-generate Test
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <span className="inline-flex p-4 bg-emerald-50 text-emerald-600 rounded-full">
                      <HelpCircle className="h-8 w-8" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-700">No practicing quiz available</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-0.5">Let’s generate an interactive Multiple-Choice exam about this document’s details to score your active memory.</p>
                    </div>
                    <button
                      onClick={() => handleGenerate("quiz")}
                      disabled={generatingTab !== null}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      {generatingTab === "quiz" ? "Creating questions..." : "Generate AI Quiz Questions"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "flashcards" && (
              <div className="space-y-6">
                {flashcards.length > 0 ? (
                  <div className="text-center py-12 space-y-4">
                    <span className="inline-flex p-4 bg-indigo-50 text-indigo-600 rounded-full">
                      <Bookmark className="h-8 w-8" />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm text-gray-800">Flipping Flashcard Deck</h4>
                      <p className="text-xs text-gray-450 mt-1">{flashcards.length} revision cards ready on study board.</p>
                    </div>
                    <div className="pt-2 flex justify-center gap-3">
                      <button
                        onClick={onStartFlashcards}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md hover:shadow-indigo-500/20 cursor-pointer"
                      >
                        Launch Flashcard Flip Desk
                      </button>
                      <button
                        onClick={() => handleGenerate("flashcards")}
                        disabled={generatingTab !== null}
                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-inherit" />
                        Re-generate Cards
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <span className="inline-flex p-4 bg-indigo-50 text-indigo-600 rounded-full">
                      <Bookmark className="h-8 w-8" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-700">No study cards built yet</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-0.5">Deploy double-sided flipping cards for strategic self-study. Ideal to review formulas, definitions, and vocabulary.</p>
                    </div>
                    <button
                      onClick={() => handleGenerate("flashcards")}
                      disabled={generatingTab !== null}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      {generatingTab === "flashcards" ? "Crafting recall cards..." : "Generate AI Flashcards"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "studyplan" && (
              <div className="space-y-6">
                {studyPlan ? (
                  <div className="space-y-5 text-left">
                    <div className="flex justify-between items-center bg-indigo-50/50 p-4 border border-indigo-100 rounded-xl">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest font-mono">Personal Study Schedule</span>
                        <h4 className="font-extrabold text-sm text-indigo-900 leading-tight">{studyPlan.title}</h4>
                      </div>
                      <button
                        onClick={() => onNavigateToView("dashboard")}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        View checklist on Dashboard
                      </button>
                    </div>

                    <div className="space-y-4">
                      {studyPlan.tasks.map((task, index) => {
                        const isTaskCompleted = !!(task.isCompleted || task.completed);
                        return (
                          <div 
                            key={task.id} 
                            className={`p-4 border rounded-xl flex items-start gap-3 transition-all ${
                              isTaskCompleted 
                                ? "bg-indigo-50/10 border-indigo-150/30 opacity-70" 
                                : "bg-white border-gray-150 hover:border-indigo-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isTaskCompleted}
                              onChange={() => onToggleTask && onToggleTask(task.id)}
                              className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer flex-shrink-0"
                            />
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center justify-center p-1 bg-xs bg-slate-100 border border-gray-200 text-slate-700 font-mono text-[9px] font-bold rounded-lg w-10 text-center flex-shrink-0 ${isTaskCompleted ? "opacity-60" : ""}`}>
                                  Day {task.dayNumber}
                                </span>
                                {task.estimated_minutes && (
                                  <span className="text-[9px] font-semibold text-gray-400 font-mono">
                                    ⏱️ {task.estimated_minutes} min
                                  </span>
                                )}
                              </div>
                              <span className={`font-bold text-gray-800 text-xs block leading-tight ${isTaskCompleted ? "line-through text-gray-400" : ""}`}>
                                {task.title}
                              </span>
                              <p className={`text-[11px] text-gray-500 leading-relaxed font-sans ${isTaskCompleted ? "line-through text-gray-405 opacity-60" : ""}`}>
                                {task.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-4 border-t border-gray-150 flex justify-end">
                      <button
                        onClick={() => handleGenerate("studyplan")}
                        disabled={generatingTab !== null}
                        className="px-3.5 py-1.5 bg-white border border-gray-200 hover:border-indigo-200 text-gray-500 hover:text-indigo-600 font-bold rounded-lg text-[10px] transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Re-schedule Timeline
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-4">
                    <span className="inline-flex p-4 bg-purple-50 text-purple-600 rounded-full">
                      <Calendar className="h-8 w-8" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Custom Study plan is empty</p>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-0.5">Let AI formulate a structured 7-Day study schedule breaking down textbook topics day-by-day with checklists.</p>
                    </div>
                    <button
                      onClick={() => handleGenerate("studyplan")}
                      disabled={generatingTab !== null}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      {generatingTab === "studyplan" ? "Scheming master plan..." : "Create study plan"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: 5-col Ask AI Grounded Tutoring Messenger */}
        <div className="lg:col-span-5 bg-white/70 backdrop-blur-2xl rounded-3xl border border-white/50 shadow-lg flex flex-col h-[550px] overflow-hidden relative">
          
          {/* Messenger title */}
          <div className="p-4 bg-slate-900/90 backdrop-blur-sm text-white flex justify-between items-center border-b border-white/10">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
                <Bot className="h-5 w-5" />
              </div>
              <div className="text-left leading-none w-full">
                <span className="font-black text-sm tracking-tight text-white block">StudyMate Chatbot</span>
                <span className="text-[9px] text-gray-300 mt-0.5 inline-block font-mono">Grounded strictly to your document</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 shrink-0">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-bold uppercase font-mono tracking-wider">online</span>
            </div>
          </div>

          {/* Messages list container stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/20" id="chat-messages-container">
            {chatMessages.map((msg, index) => {
              const isAi = msg.role === "ai";
              return (
                <div key={index} className={`flex items-start gap-2.5 ${isAi ? "" : "flex-row-reverse"}`}>
                  <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${isAi ? "bg-white/75 text-indigo-650 border border-white/60 shadow-3xs" : "bg-slate-800 text-white"}`}>
                    {isAi ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  
                  <div className="space-y-1 max-w-[80%] min-w-0 flex flex-col items-start font-sans">
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed font-sans font-medium text-left ${
                      isAi 
                        ? "bg-white border border-slate-150/60 text-slate-800 rounded-tl-none whitespace-pre-wrap shadow-3xs" 
                        : "bg-blue-600 text-white rounded-tr-none shadow-3xs"
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[8px] text-gray-400 font-mono self-start ml-1 mt-0.5">
                      {msg.time}
                    </span>
                  </div>
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0 animate-bounce">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-white border border-gray-150 p-3 rounded-2xl rounded-tl-none text-xs text-gray-400 flex items-center gap-1.5 animate-pulse max-w-[80%] text-left">
                  <span>Gemini Tutor analyzing and replying...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Messenger input form footer */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-gray-150 bg-white flex gap-2">
            <input
              type="text"
              required
              disabled={chatLoading}
              placeholder="Ask anything about this document..."
              className="flex-1 px-3 py-2 border border-gray-200 focus:border-blue-500 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-sans"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
