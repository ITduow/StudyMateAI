/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { FileText, PlusCircle, CheckSquare, Trophy, AlertTriangle, Trash2, CalendarCheck, HelpCircle, Activity, ExternalLink, Sparkles, AlertCircle } from "lucide-react";
import { User, Document } from "../types";

interface DashboardViewProps {
  currentUser: User;
  documents: Document[];
  progress: {
    quizzes: { quizId: string; title: string; score: number; maxScore: number; date: string }[];
    flashcardProgress: Record<string, { cardId: string; boxIndex: number; lastReviewed: string }>;
    totalAIUsage: number;
    lastActive: string;
    flashcardSessionsCount?: number;
    avgMasteryRate?: number;
    lastStudiedDocTitle?: string;
  };
  upcomingTasks: { id: string; title: string; description: string; dayNumber: number; isCompleted: boolean; docTitle: string; docId?: string }[];
  onDocumentClick: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onToggleTask: (taskId: string) => void;
  onNavigate: (view: string) => void;
  onUpgradeTier?: (tier: "free" | "premium" | "payos") => void;
}

export function DashboardView({
  currentUser,
  documents,
  progress,
  upcomingTasks,
  onDocumentClick,
  onDeleteDocument,
  onToggleTask,
  onNavigate,
  onUpgradeTier
}: DashboardViewProps) {
  
  // Progress calculations
  const totalQuizzes = progress.quizzes.length;
  const avgQuizScorePercent = totalQuizzes > 0 
    ? Math.round((progress.quizzes.reduce((sum, q) => sum + (q.score / q.maxScore), 0) / totalQuizzes) * 100)
    : 0;
    
  const memorizedFlashcardsCount = Object.values(progress.flashcardProgress).filter(p => p.boxIndex >= 3).length;
  const completedTasksCount = upcomingTasks.filter(t => t.isCompleted).length;
  const totalTasksCount = upcomingTasks.length;
  const taskProgressPercent = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  // Formatting file size
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" id="dashboard-view">
      
      {/* Upper Welcome Header banner */}
      <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 sm:p-8 text-white flex flex-col md:flex-row md:justify-between md:items-center gap-6 relative overflow-hidden shadow-lg">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-550 rounded-full blur-3xl opacity-10 pointer-events-none" />
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight font-display">Active Room Workspace</h2>
          <p className="text-slate-350 text-xs sm:text-sm">
            Good afternoon! Studying {documents.length} educational syllabus resources. Keep pushing your scores!
          </p>
          {progress.lastStudiedDocTitle && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg text-[11px] text-indigo-250 font-bold border border-white/5 font-sans mt-1">
              <Activity className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
              Last Studied: <span className="text-white">{progress.lastStudiedDocTitle}</span>
            </div>
          )}
        </div>
        
        {/* Floating Upload Launch Button */}
        <button
          onClick={() => onNavigate("home")}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 focus:outline-none transition-all hover:scale-[1.02] shadow-md hover:shadow-blue-550/20 w-fit cursor-pointer animate-pulse"
        >
          <PlusCircle className="h-4.5 w-4.5" />
          Upload New Document
        </button>
      </div>

      {/* Premium Upgrade Promotion Banner Card */}
      <div className="glass-effect-card rounded-[24px] p-6 border-l-4 border-l-indigo-650 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs relative overflow-hidden bg-white/45 backdrop-blur-xl" id="premium-status-promo-banner">
        <div className="space-y-1.5 flex-1">
          {currentUser.subscription === "premium" ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-150 uppercase tracking-widest font-mono">
                  Badge: Premium
                </span>
                <span className="text-xs font-semibold text-gray-300">•</span>
                <h3 className="font-extrabold text-sm tracking-tight text-gray-900">Premium Account</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-sans">
                Higher AI generation limits enabled. Thank you for activating StudyMate Premium to copilot your education!
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-200 uppercase tracking-widest font-mono">
                  Free Account
                </span>
                <span className="text-xs font-semibold text-gray-300">•</span>
                <h3 className="font-extrabold text-sm tracking-tight text-gray-900 font-display text-slate-800">Daily AI limit is limited</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-sans">
                Unlock infinite summarizing, custom flashcard creation, and comprehensive study planning tools with no boundaries.
              </p>
            </>
          )}
        </div>
        {currentUser.subscription !== "premium" && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onUpgradeTier?.("payos")}
              className="flex items-center justify-center gap-1.5 py-2 px-4 bg-gradient-to-r from-indigo-600 to-indigo-750 hover:scale-[1.02] text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-500/10 cursor-pointer transition-all flex-shrink-0 font-sans"
              id="upgrade-to-premium-payos-button"
            >
              <Sparkles className="h-4 w-4 animate-pulse text-amber-300" />
              Upgrade with VietQR / Bank Transfer
            </button>

          </div>
        )}
      </div>

      {/* Main Bento Statistics Grid Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-bento-grid">
        
        {/* Stat item 1: Documents */}
        <div className="glass-effect-card p-5 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-blue-50/80 text-blue-600 rounded-xl border border-white/30">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">My Materials</span>
            <span className="text-2xl font-black text-gray-900 leading-tight block">{documents.length}</span>
            <span className="block text-[10px] text-gray-400 mt-0.5">Uploaded resources</span>
          </div>
        </div>

        {/* Stat item 2: Quiz Average / Mastery Rate */}
        <div className="glass-effect-card p-5 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-emerald-50/80 text-emerald-600 rounded-xl border border-white/30">
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Study Average</span>
            <span className="text-2xl font-black text-gray-900 leading-tight block">
              {totalQuizzes > 0 ? `${avgQuizScorePercent}%` : "No Score"}
            </span>
            <span className="block text-[10px] text-gray-400 mt-0.5">{totalQuizzes} saved achievements</span>
          </div>
        </div>

        {/* Stat item 3: Flashcards box */}
        <div className="glass-effect-card p-5 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-indigo-50/80 text-indigo-600 rounded-xl border border-white/30">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Active Recall</span>
            <span className="text-2xl font-black text-gray-900 leading-tight block">
              {progress.flashcardSessionsCount !== undefined && progress.flashcardSessionsCount > 0 
                ? progress.flashcardSessionsCount 
                : memorizedFlashcardsCount}
            </span>
            <span className="block text-[10px] text-gray-400 mt-0.5">
              {progress.flashcardSessionsCount !== undefined && progress.flashcardSessionsCount > 0 
                ? `${progress.avgMasteryRate || 0}% avg recall rate`
                : `Cards master box 3+ (${memorizedFlashcardsCount})`}
            </span>
          </div>
        </div>

        {/* Stat item 4: AI Usage Limit warning */}
        <div className="glass-effect-card p-5 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-rose-50/80 text-rose-600 rounded-xl border border-white/30">
            <Activity className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">AI Requests Logger</span>
            <span className="text-2xl font-black text-gray-900 leading-tight block">
              {progress.totalAIUsage} <span className="text-xs font-normal text-gray-450">/ {currentUser.subscription === "premium" ? "∞" : "15"}</span>
            </span>
            
            {/* Usage progression bar */}
            {currentUser.subscription !== "premium" ? (
              <div className="w-full bg-slate-200/40 rounded-full h-1 mt-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full ${progress.totalAIUsage >= 12 ? "bg-red-500 animate-pulse" : "bg-rose-500"}`}
                  style={{ width: `${Math.min((progress.totalAIUsage / 15) * 100, 100)}%` }}
                />
              </div>
            ) : (
              <span className="block text-[10px] text-indigo-600 font-semibold mt-0.5">Premium Unlimited Activated</span>
            )}
          </div>
        </div>
      </div>

      {/* Main dashboard body section split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left 8-col section: Textbook documents and quiz achievements */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Documents Section */}
          <div className="glass-effect-card rounded-[24px] p-6 space-y-4 shadow-sm">
            <div className="flex justify-between items-center pb-2">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">Study Materials On Shelf</h3>
                <p className="text-gray-400 text-xs">Pick an academic document to summarizing or generate practicing content.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-white/60 border border-white/80 px-2.5 py-1 rounded-xl shadow-2xs">
                {documents.length} Files
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 bg-white/30 rounded-xl space-y-3">
                <div className="mx-auto h-12 w-12 text-gray-300 flex items-center justify-center">
                  <FileText className="h-10 w-10" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700">No textbook files on shelf yet</p>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto mt-0.5">Get started by uploading your study materials on the home portal to unleash AI copilot power.</p>
                </div>
                <button
                  onClick={() => onNavigate("home")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                >
                  Upload My First File
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="documents-grid-list">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="group border border-white/60 bg-white/45 backdrop-blur-md rounded-2xl p-4 hover:border-indigo-400 hover:bg-white/70 transition-all relative flex flex-col justify-between shadow-xs hover:shadow-md"
                  >
                    <div className="space-y-2.5 cursor-pointer" onClick={() => onDocumentClick(doc.id)}>
                      <div className="flex justify-between items-start">
                        <span className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                          <FileText className="h-5 w-5" />
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">
                          {formatBytes(doc.fileSize)}
                        </span>
                      </div>
                      
                      <div className="space-y-0.5">
                        <span className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors block text-sm line-clamp-2">
                          {doc.title}
                        </span>
                        <span className="block text-[10px] text-gray-400">
                          Uploaded on {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                      <button
                        onClick={() => onDocumentClick(doc.id)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                      >
                        Start Studying
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete Trigger */}
                      <button
                        onClick={() => onDeleteDocument(doc.id)}
                        title="Delete Document"
                        className="text-gray-400 hover:text-red-500 p-1 bg-white/60 hover:bg-red-50 rounded-lg transition-all border border-gray-200/40 hover:border-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Quiz Scores */}
          <div className="glass-effect-card rounded-[24px] p-6 space-y-4 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Recent Study Achievements</h3>
              <p className="text-gray-400 text-xs">Review your historical quiz outcomes and active-recall flashcard mastery sessions.</p>
            </div>

            {progress.quizzes.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-6">You haven't resolved any practice quizzes or flashcard sessions yet. Open any document to begin studying!</p>
            ) : (
              <div className="space-y-3">
                {progress.quizzes.map((record, index) => {
                  const pct = record.maxScore > 0 ? Math.round((record.score / record.maxScore) * 100) : 0;
                  return (
                    <div
                      key={index}
                      className="p-4 bg-white/50 border border-white/70 rounded-xl flex items-center justify-between gap-4 shadow-2xs hover:bg-white/80 transition-all font-sans"
                    >
                      <div className="space-y-1">
                        <span className="font-bold text-gray-800 text-xs block">{record.title}</span>
                        <span className="block text-[10px] text-gray-400 font-mono">
                          Taken {new Date(record.date).toLocaleDateString()} • {record.score} of {record.maxScore} items ({pct >= 75 ? "mastered" : "learning"})
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-3.5">
                        <span className={`px-2.5 py-1 text-xs font-extrabold rounded-lg ${
                          pct >= 80 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : pct >= 50 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-red-50 text-red-700 border border-red-100"
                        }`}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 4-col section: Personal Study Calendar & AI Info block */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Upcoming Study Plan Tasks Checklist */}
          <div className="glass-effect-card rounded-[24px] p-6 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900">Studying Timeline</h3>
                <p className="text-gray-400 text-xs">AI-scheduled tasks for this week.</p>
              </div>
              <span className="p-2 bg-indigo-50/70 border border-indigo-100/45 text-indigo-600 rounded-xl">
                <CalendarCheck className="h-4.5 w-4.5" />
              </span>
            </div>

            {/* Micro task progression bar */}
            {totalTasksCount > 0 && (
              <div className="space-y-1.5 pb-2">
                <div className="flex justify-between text-[10px] font-bold text-gray-500 font-mono">
                  <span>WEEKLY COMPLETED</span>
                  <span>{completedTasksCount}/{totalTasksCount} ({taskProgressPercent}%)</span>
                </div>
                <div className="w-full bg-slate-200/50 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${taskProgressPercent}%` }} 
                  />
                </div>
              </div>
            )}

            {upcomingTasks.length === 0 ? (
              <div className="text-center py-8 space-y-1">
                <p className="text-xs text-gray-400 italic">No scheduled tasks currently.</p>
                <p className="text-[10px] text-gray-400 max-w-xs mx-auto">Open any study material from lists and tap "Study Plan" to deploy a personalized layout.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {upcomingTasks.map((task, idx) => (
                  <div
                    key={`${task.docId || "doc"}-${task.id || "task"}-${idx}`}
                    className={`p-3 rounded-xl border transition-all ${
                      task.isCompleted 
                        ? "bg-white/20 border-slate-250/30 opacity-70" 
                        : "bg-white/60 border-white/80 shadow-2xs hover:border-indigo-400 hover:bg-white/80"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={task.isCompleted}
                        onChange={() => onToggleTask(task.id)}
                        className="mt-1 h-3.5 w-3.5 text-indigo-650 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <div className="space-y-1 flex-1 min-w-0">
                        <span className={`text-xs font-bold text-slate-800 block leading-tight ${
                          task.isCompleted ? "line-through text-slate-400" : ""
                        }`}>
                          {task.title}
                        </span>
                        <p className={`text-[10px] text-gray-500 font-sans leading-tight line-clamp-2 ${
                          task.isCompleted ? "text-slate-400 opacity-60" : ""
                        }`}>
                          {task.description}
                        </p>
                        <div className="flex justify-between items-center pt-1">
                          <span className="inline-block px-1.5 py-0.5 bg-slate-200/60 border border-slate-300/40 text-slate-650 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                            Day {task.dayNumber}
                          </span>
                          <span className="text-[8px] text-gray-400 truncate max-w-[120px] font-mono block">
                            {task.docTitle}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Helper Quick Guide */}
          <div className="bg-gradient-to-br from-indigo-950/80 to-slate-950/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 text-white space-y-4 shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500 rounded-full blur-2xl opacity-20 pointer-events-none" />
            <span className="inline-flex p-2 bg-indigo-900 border border-white/10 text-indigo-300 rounded-xl">
              <AlertCircle className="h-5 w-5 animate-pulse" />
            </span>
            <div className="space-y-1.5">
              <h4 className="font-extrabold text-sm tracking-tight text-white font-display">How studying is recorded</h4>
              <p className="text-[11px] text-indigo-155 leading-relaxed">
                StudyMate automatically counts your quiz scores and memorization performance. By updating card difficulty, cards migrate across memory boxes. Finish daily study plans to complete weekly goals.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
