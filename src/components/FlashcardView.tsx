/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from "react";
import { 
  Bookmark, ChevronRight, ChevronLeft, HelpCircle, RefreshCw, Star, 
  Trash2, Brain, ArrowLeft, RotateCw, Smile, Frown, CheckSquare 
} from "lucide-react";
import { Flashcard } from "../types";

interface FlashcardViewProps {
  flashcards: Flashcard[];
  onReviewCard: (cardId: string, isLearned: boolean) => Promise<void>;
  onBack: () => void;
  onSaveProgress?: (stats: {
    totalCards: number;
    gotItCount: number;
    stillLearningCount: number;
    masteryRate: number;
  }) => Promise<boolean>;
}

export function FlashcardView({
  flashcards,
  onReviewCard,
  onBack,
  onSaveProgress
}: FlashcardViewProps) {
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCards, setReviewedCards] = useState<Record<string, "easy" | "hard">>({});
  const [sessionRatings, setSessionRatings] = useState<Record<string, boolean>>({}); // unique cardId -> isLearned mapping
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const cards = Array.isArray(flashcards) ? flashcards : [];

  if (cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <span className="inline-flex p-4 bg-indigo-50 text-indigo-600 rounded-full">
          <Bookmark className="h-8 w-8 animate-bounce" />
        </span>
        <h3 className="font-extrabold text-gray-900 text-lg">No Cards Deck</h3>
        <p className="text-gray-400 text-xs">No active flashcards generated. Exit and generate cards under Document Tab details as needed.</p>
        <button onClick={onBack} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold">Go Back</button>
      </div>
    );
  }

  const currentCard = cards[activeIndex] || { id: "temp", front: "Empty", back: "Empty", boxIndex: 1 };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    setIsFlipped(false);
    if (activeIndex + 1 < cards.length) {
      setActiveIndex((idx) => idx + 1);
    }
  };

  const handlePrev = () => {
    setIsFlipped(false);
    if (activeIndex > 0) {
      setActiveIndex((idx) => idx - 1);
    }
  };

  const handleDifficultyAction = async (isLearned: boolean) => {
    // Record visual state feedback
    setReviewedCards((prev) => ({
      ...prev,
      [currentCard.id]: isLearned ? "easy" : "hard"
    }));

    // Record unique session ratings to prevent double counting
    setSessionRatings((prev) => ({
      ...prev,
      [currentCard.id]: isLearned
    }));

    // Trigger Leitner box state save with database
    try {
      await onReviewCard(currentCard.id, isLearned);
    } catch (err) {
      console.error("Failed to commit rating: ", err);
    }

    // Automatically slide to next card, or if on the last card, complete session
    setTimeout(() => {
      if (activeIndex + 1 < cards.length) {
        handleNext();
      } else {
        setIsSessionFinished(true); // completed session!
      }
    }, 400);
  };

  const currentReviewStatus = reviewedCards[currentCard.id];

  const sessionTotal = Object.keys(sessionRatings).length;
  const sessionGotIt = Object.values(sessionRatings).filter(val => val === true).length;
  const sessionStillLearning = Object.values(sessionRatings).filter(val => val === false).length;
  const sessionMasteryRate = sessionTotal > 0 ? Math.round((sessionGotIt / sessionTotal) * 100) : 0;

  const handleSaveProgress = async () => {
    if (!onSaveProgress) return;
    setIsSaving(true);
    setSaveSuccess(null);
    try {
      const ok = await onSaveProgress({
        totalCards: sessionTotal,
        gotItCount: sessionGotIt,
        stillLearningCount: sessionStillLearning,
        masteryRate: sessionMasteryRate
      });
      if (ok) {
        setSaveSuccess("Your progress has been successfully saved to your profile!");
      } else {
        setSaveSuccess("Failed to save progress. Please check your connection.");
      }
    } catch (err: any) {
      setSaveSuccess(`Error: ${err?.message || "Failed to save progress."}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReviewAgain = () => {
    setActiveIndex(0);
    setIsFlipped(false);
    setSessionRatings({});
    setReviewedCards({});
    setIsSessionFinished(false);
    setSaveSuccess(null);
  };

  if (isSessionFinished) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-6 animate-fade-in" id="flashcards-completion-page">
        <div className="glass-effect-card p-6 sm:p-8 rounded-2xl shadow-xl text-center space-y-6 relative overflow-hidden">
          {/* Ambient light glow inside card */}
          <div className="absolute -top-12 -left-12 w-24 h-24 bg-indigo-200/50 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-emerald-200/50 rounded-full blur-2xl pointer-events-none" />

          {/* Icon Badge */}
          <div className="inline-flex p-4 bg-indigo-50 text-indigo-600 rounded-full">
            <CheckSquare className="h-8 w-8 animate-bounce" style={{ animationDuration: "3s" }} />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-black text-slate-900 tracking-tight font-sans">
              Flashcard Session Completed
            </h2>
            <p className="text-xs text-gray-500 font-sans max-w-xs mx-auto">
              Outstanding work! You've reviewed your active recall desk and tested your active learning retention.
            </p>
          </div>

          {/* Mastery Circular Score Chart styling */}
          <div className="py-2 flex flex-col items-center justify-center space-y-1">
            <div className={`text-4xl sm:text-5xl font-black tracking-tight ${
              sessionMasteryRate >= 75 ? "text-emerald-600" : sessionMasteryRate >= 50 ? "text-blue-600" : "text-amber-500"
            }`}>
              {sessionMasteryRate}%
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
              Recall Mastery Rate
            </span>
          </div>

          {/* Grid Stats blocks */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3 text-center">
              <span className="block text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">reviewed</span>
              <span className="text-lg font-extrabold text-slate-800 font-sans">{sessionTotal}</span>
            </div>
            
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-center">
              <span className="block text-[10px] font-bold text-emerald-600 uppercase font-mono tracking-wider">got it</span>
              <span className="text-lg font-extrabold text-emerald-700 font-sans">{sessionGotIt}</span>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3 text-center">
              <span className="block text-[10px] font-bold text-red-500 uppercase font-mono tracking-wider">hard</span>
              <span className="text-lg font-extrabold text-red-700 font-sans">{sessionStillLearning}</span>
            </div>
          </div>

          {/* Feedback description text */}
          <p className="text-xs font-semibold text-slate-700 max-w-sm italic px-2">
            {sessionMasteryRate >= 80 
              ? "🎯 Excellent recall accuracy! These terms are safely moving up your memory boxes."
              : sessionMasteryRate >= 50 
                ? "👍 Solid progress! Keep reviewing to lock them in permanently."
                : "🔁 Don't worry! Consistent active recall helps build stronger synaptic neural pathways."}
          </p>

          {/* Inline alert/status messages after save progress */}
          {saveSuccess && (
            <div className={`p-3 rounded-lg text-xs leading-relaxed font-semibold transition-all border text-center ${
              saveSuccess.includes("successfully") 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : "bg-red-50 text-red-800 border-red-200"
            }`}>
              {saveSuccess}
            </div>
          )}

          {/* Button Layout */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            {onSaveProgress && (
              <button
                disabled={isSaving}
                onClick={handleSaveProgress}
                className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-950 font-bold text-white rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? "Saving..." : "Save Progress"}
              </button>
            )}

            <button
              onClick={handleReviewAgain}
              className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-extrabold border border-gray-200 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Review Again
            </button>
          </div>

          <div>
            <button
              onClick={onBack}
              className="w-full text-slate-400 hover:text-slate-600 text-[11px] font-bold tracking-wide transition-colors uppercase font-mono cursor-pointer"
            >
              Back to Document
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6 animate-fade-in" id="active-flashcards-page">
      
      {/* Header Navigator panel */}
      <div className="glass-effect-card p-4 rounded-xl shadow-sm flex justify-between items-center">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={onBack}
            className="p-1 px-2 bg-white/60 hover:bg-slate-50 border border-white/70 hover:border-gray-300 text-gray-500 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
            id="back-from-flashcards-button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          
          <div className="text-left font-sans">
            <span className="block text-[9px] font-bold text-gray-400 tracking-widest uppercase font-mono">self study portal</span>
            <span className="font-extrabold text-xs text-gray-800 block leading-tight">Active Flashcard Flip Desk</span>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50/70 border border-blue-100/40 px-3 py-1 rounded-full">
          Card {activeIndex + 1} of {cards.length}
        </span>
      </div>

      {/* 3D Flippable Card perspective wrapper */}
      <div 
        onClick={handleFlip}
        className="w-full h-80 rounded-2xl relative cursor-pointer border border-transparent select-none perspective group"
        id="flippable-study-card"
        style={{ perspective: "1000px" }}
      >
        <div 
          className="absolute inset-0 w-full h-full transition-transform duration-500"
          style={{ 
            transformStyle: "preserve-3d", 
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
          }}
        >
          {/* FRONT FACE SECTION */}
          <div 
            className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-between bg-white/95 backdrop-blur-3xl shadow-xl border border-white/60 rounded-2xl" 
            style={{ 
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden"
            }}
          >
            <div className="flex justify-between items-start">
              <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-mono text-[9px] font-bold tracking-wider uppercase">front prompt</span>
              <span className="text-[10px] text-gray-400 font-mono">leitner box {currentCard.boxIndex || 0}</span>
            </div>

            <div className="text-center px-4 space-y-4">
              <p className="text-base sm:text-lg font-black text-gray-950 leading-snug font-sans break-words my-2">
                {currentCard.front}
              </p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 group-hover:text-blue-600 transition-colors font-sans mt-3">
                <RotateCw className="h-3 w-3 animate-spin" style={{ animationDuration: "12s" }} />
                Tap Card to Reveal Answer
              </span>
            </div>

            <div className="flex justify-between text-slate-350 pointer-events-none">
              <Brain className="h-4 w-4 text-slate-200" />
              <Star className="h-4 w-4 text-slate-200" />
            </div>
          </div>

          {/* BACK FACE SECTION */}
          <div 
            className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-between bg-white/95 backdrop-blur-3xl shadow-xl border border-white/60 rounded-2xl" 
            style={{ 
              backfaceVisibility: "hidden", 
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)"
            }}
          >
            <div className="flex justify-between items-start">
              <span className="inline-flex px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-mono text-[9px] font-bold tracking-wider uppercase">back definition</span>
              <span className="text-[10px] text-gray-400 font-mono">leitner box {currentCard.boxIndex || 0}</span>
            </div>

            <div className="text-center px-4 space-y-2">
              <p className="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed font-sans max-w-sm mx-auto overflow-y-auto max-h-[140px] whitespace-pre-wrap py-2">
                {currentCard.back}
              </p>
            </div>

            <div className="flex justify-between text-slate-350 pointer-events-none">
              <Star className="h-4 w-4 text-slate-200" />
              <Brain className="h-4 w-4 text-slate-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Slide Navigation toggles and Difficulty estimation prompts */}
      <div className="space-y-4">
        
        {/* Estimation Controls when card is flipped, satisfying Subsection 3 ("Flashcard Page") */}
        <div className="glass-effect-card p-4 rounded-xl space-y-3 font-sans shadow-xs">
          <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center font-mono">Self-Rate Memory recall recall difficulty:</span>
          
          <div className="grid grid-cols-2 gap-3" id="recall-difficulty-controls">
            <button
              onClick={() => handleDifficultyAction(false)}
              className={`p-3 rounded-xl border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                currentReviewStatus === "hard" 
                  ? "bg-red-50 text-red-700 border-red-300 font-bold" 
                  : "bg-white/60 text-red-650 border-white/65 hover:bg-red-50/50"
              }`}
            >
              <Frown className="h-4.5 w-4.5 text-inherit" />
              <div className="text-left font-sans">
                <span className="text-xs block leading-none font-bold">Hard (Retry)</span>
                <span className="text-[8px] text-gray-450 block mt-0.5">Demote Box</span>
              </div>
            </button>
            
            <button
              onClick={() => handleDifficultyAction(true)}
              className={`p-3 rounded-xl border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                currentReviewStatus === "easy" 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold" 
                  : "bg-white/60 text-emerald-650 border-white/65 hover:bg-emerald-50/50"
              }`}
            >
              <Smile className="h-4.5 w-4.5 text-inherit" />
              <div className="text-left font-sans">
                <span className="text-xs block leading-none font-bold">Easy (Got It!)</span>
                <span className="text-[8px] text-gray-450 block mt-0.5">Promote Box</span>
              </div>
            </button>
          </div>
        </div>

        {/* Slide controls */}
        <div className="flex justify-between items-center glass-effect-card p-3 rounded-xl font-mono shadow-3xs">
          <button
            onClick={handlePrev}
            disabled={activeIndex === 0}
            className="inline-flex items-center gap-1 text-xs text-gray-550 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none font-sans cursor-pointer font-semibold"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
            Previous card
          </button>

          <span className="text-xs text-gray-450">
            {activeIndex + 1} / {cards.length}
          </span>

          {activeIndex === cards.length - 1 ? (
            <button
              onClick={() => setIsSessionFinished(true)}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-sans cursor-pointer font-extrabold animate-pulse"
            >
              Finish Session
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1 text-xs text-gray-550 hover:text-slate-800 font-sans cursor-pointer font-semibold"
            >
              Next card
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
