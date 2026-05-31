/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  CheckCircle2, XCircle, ArrowRight, Home, RefreshCw, Trophy, 
  HelpCircle, AlertCircle, BookOpen, ChevronRight, Bookmark, ArrowLeft
} from "lucide-react";
import { Quiz, QuizQuestion } from "../types";

interface QuizViewProps {
  quiz: Quiz;
  onSaveScore: (score: number, maxScore: number, wrongQuestions: any[]) => Promise<void>;
  onBack: () => void;
}

export function QuizView({
  quiz,
  onSaveScore,
  onBack
}: QuizViewProps) {
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  // Wrong questions tracker for evaluation review
  const [wrongQuestions, setWrongQuestions] = useState<any[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" id="practice-quiz-panel">
        <div className="flex justify-between items-center bg-white p-4 border border-gray-150 rounded-xl">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onBack}
              className="p-1 px-2 hover:bg-slate-50 border border-gray-250 hover:border-gray-300 text-gray-500 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
              id="back-from-quiz-button"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-left font-sans">
              <span className="block text-[9px] font-bold text-gray-400 tracking-widest uppercase font-mono">testing center</span>
              <h4 className="font-extrabold text-xs text-gray-800 tracking-tight line-clamp-1">{quiz?.title || "Subject Quiz"}</h4>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-8 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h3 className="text-lg font-bold text-gray-800">No Questions Available</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            This quiz does not contain any questions yet, or they could not be loaded successfully. Please try generating the quiz again.
          </p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion: QuizQuestion = quiz.questions[currentIndex];

  const handleOptionSelect = (index: number) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(index);
  };

  const handleSubmitAnswer = () => {
    if (selectedOption === null || isAnswerSubmitted) return;
    
    const isCorrect = selectedOption === currentQuestion.correctAnswerIndex;
    if (isCorrect) {
      setScore((s) => s + 1);
    } else {
      // Log wrong question for final detailed review layout
      setWrongQuestions((prev) => [
        ...prev,
        {
          questionText: currentQuestion.text,
          options: currentQuestion.options,
          userAnswerIndex: selectedOption,
          correctAnswerIndex: currentQuestion.correctAnswerIndex,
          explanation: currentQuestion.explanation
        }
      ]);
    }
    setIsAnswerSubmitted(true);
  };

  const handleNextQuestion = () => {
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    
    if (currentIndex + 1 < quiz.questions.length) {
      setCurrentIndex((idx) => idx + 1);
    } else {
      setQuizFinished(true);
    }
  };

  const handleSaveResult = async () => {
    setIsSaving(true);
    try {
      await onSaveScore(score, quiz.questions.length, wrongQuestions);
      setSavedSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetake = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setScore(0);
    setWrongQuestions([]);
    setQuizFinished(false);
    setSavedSuccess(false);
  };

  // Percent indicator helper
  const pct = Math.round((score / quiz.questions.length) * 105); // dynamic visualization gauge

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" id="practice-quiz-panel">
      
      {/* Header Row */}
      <div className="flex justify-between items-center bg-white p-4 border border-gray-150 rounded-xl">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={onBack}
            className="p-1 px-2 hover:bg-slate-50 border border-gray-250 hover:border-gray-300 text-gray-500 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
            id="back-from-quiz-button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          
          <div className="text-left font-sans">
            <span className="block text-[9px] font-bold text-gray-400 tracking-widest uppercase font-mono">testing center</span>
            <h4 className="font-extrabold text-xs text-gray-800 tracking-tight line-clamp-1">{quiz.title}</h4>
          </div>
        </div>

        {!quizFinished && (
          <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            Question {currentIndex + 1} of {quiz.questions.length}
          </span>
        )}
      </div>

      {/* Main body of quiz content */}
      {!quizFinished ? (
        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-6 sm:p-8 space-y-6" id="active-quiz-card">
          
          {/* Question Text Prompt */}
          <div className="space-y-2">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
              />
            </div>
            <p className="text-sm font-semibold text-gray-400 font-mono text-left pt-2 uppercase">Core Prompt:</p>
            <h3 className="text-base sm:text-lg font-black text-gray-900 leading-snug text-left font-sans">
              {currentQuestion.text}
            </h3>
          </div>

          {/* Answer Choice Options buttons list */}
          <div className="space-y-3" id="options-choices-buttons-list">
            {currentQuestion.options.map((opt, oIdx) => {
              const isSelected = selectedOption === oIdx;
              const isCorrectTarget = oIdx === currentQuestion.correctAnswerIndex;
              
              // Color styles calculation based on state
              let btnStyle = "border-gray-200 hover:border-blue-400 hover:bg-slate-50";
              if (isSelected) btnStyle = "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500 text-blue-900";
              
              if (isAnswerSubmitted) {
                if (isCorrectTarget) {
                  btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-bold";
                } else if (isSelected) {
                  btnStyle = "border-red-500 bg-red-50 text-red-900";
                } else {
                  btnStyle = "border-gray-150 opacity-40";
                }
              }

              return (
                <button
                  key={oIdx}
                  onClick={() => handleOptionSelect(oIdx)}
                  className={`w-full p-4 rounded-xl border text-left text-xs sm:text-sm font-medium transition-all flex items-center justify-between gap-3 ${btnStyle}`}
                  id={`choice-option-${oIdx}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-500">
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <span className="leading-tight">{opt}</span>
                  </div>

                  {/* Icon overrides */}
                  {isAnswerSubmitted && (
                    <div className="flex-shrink-0">
                      {isCorrectTarget && <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-current bg-white rounded-full" />}
                      {isSelected && !isCorrectTarget && <XCircle className="h-5 w-5 text-red-500 fill-current bg-white rounded-full" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation panel rendered after submission */}
          {isAnswerSubmitted && (
            <div className="p-4 bg-slate-50 border border-gray-150 rounded-xl space-y-2 animate-fade-in text-left">
              <div className="flex items-center gap-2">
                {selectedOption === currentQuestion.correctAnswerIndex ? (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-extrabold text-emerald-700 bg-emerald-100/50 px-2.5 py-0.5 rounded">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Spot on correct answer
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-extrabold text-red-700 bg-red-100/50 px-2.5 py-0.5 rounded">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    Incorrect choice
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-sans font-medium">
                <strong>Explanation Detail:</strong> {currentQuestion.explanation}
              </p>
            </div>
          )}

          {/* CTA controls */}
          <div className="pt-4 border-t border-gray-100 flex justify-end">
            {!isAnswerSubmitted ? (
              <button
                onClick={handleSubmitAnswer}
                disabled={selectedOption === null}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-gray-400 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Submit Answer
              </button>
            ) : (
              <button
                onClick={handleNextQuestion}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                id="next-question-button"
              >
                {currentIndex + 1 < quiz.questions.length ? "Next Question" : "Finish Practice Test"}
                <ArrowRight className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Quiz Complete Panel - Detailed Summary & Review */
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-8 text-center animate-fade-in" id="quiz-complete-overview animate-fade-in">
          
          <div className="max-w-md mx-auto space-y-3.5">
            <span className="inline-flex p-5 bg-yellow-50 text-yellow-600 rounded-full animate-bounce">
              <Trophy className="h-10 w-10" />
            </span>
            <div>
              <h2 className="text-2xl font-black text-gray-900">Quiz Completed!</h2>
              <p className="text-gray-400 text-xs">Nice active study! Standard practicing metrics generated below.</p>
            </div>

            {/* Radial Percentage representation */}
            <div className="p-4 bg-slate-50 border border-gray-150 rounded-2xl flex justify-between items-center">
              <div className="text-left space-y-0.5">
                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">My Score Tally</span>
                <span className="text-3xl font-black text-gray-900">
                  {score} <span className="text-lg font-normal text-gray-400">/ {quiz.questions.length}</span>
                </span>
              </div>
              <span className={`px-4 py-2 hover:scale-105 transition-all text-sm font-black rounded-xl ${
                pct >= 80 ? "bg-emerald-50 text-emerald-700" : pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
              }`}>
                {pct >= 100 ? "Flawless Ace!" : pct >= 80 ? "Superb Job!" : pct >= 50 ? "Passing Score" : "Needs Review"}
              </span>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            {!savedSuccess ? (
              <button
                onClick={handleSaveResult}
                disabled={isSaving}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md hover:shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center cursor-pointer"
              >
                {isSaving ? "Saving scores..." : "Save Score statistics to My Profile"}
              </button>
            ) : (
              <span className="px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <CheckCircle2 className="h-4 w-4" />
                Score successfully synchronized!
              </span>
            )}

            <button
              onClick={handleRetake}
              className="px-5 py-3 bg-white border border-gray-250 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-xs transition-all flex items-center gap-1 cursor-pointer"
              id="retake-quiz-button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retake Test
            </button>
            
            <button
              onClick={onBack}
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Exit Center
            </button>
          </div>

          {/* Detailed Wrong Answer Review segment, satisfying Subsection 3 ("Quiz Page") */}
          {wrongQuestions.length > 0 && (
            <div className="pt-8 border-t border-gray-150 text-left space-y-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                  <AlertCircle className="h-4.5 w-4.5 text-amber-500" />
                  Detailed Wrong Answer Review ({wrongQuestions.length})
                </h4>
                <p className="text-[11px] text-gray-550">Review the queries you struggled with to cement proper mental mappings before testing again.</p>
              </div>

              <div className="space-y-4">
                {wrongQuestions.map((wq, wIdx) => (
                  <div key={wIdx} className="p-4 bg-rose-50/40 border border-red-150 rounded-xl space-y-3 font-sans">
                    <span className="inline-block px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-mono text-[9px] font-bold">MISS TALLY #{wIdx + 1}</span>
                    <h5 className="font-bold text-gray-900 text-xs sm:text-sm leading-tight text-left">{wq.questionText}</h5>
                    
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="p-2 bg-red-50 text-red-700 rounded text-xs border border-red-100">
                        <strong className="block text-[8px] uppercase tracking-wider text-red-500 mb-0.5 font-mono">My Answer Choice</strong>
                        {wq.options[wq.userAnswerIndex]}
                      </div>
                      <div className="p-2 bg-emerald-50 text-emerald-700 rounded text-xs border border-emerald-100">
                        <strong className="block text-[8px] uppercase tracking-wider text-emerald-500 mb-0.5 font-mono">Correct Answer Fact</strong>
                        {wq.options[wq.correctAnswerIndex]}
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-500 leading-relaxed font-sans pt-1">
                      <strong>AI Detailed Explanation:</strong> {wq.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
