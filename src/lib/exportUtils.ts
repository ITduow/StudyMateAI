/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from "jspdf";
import { Quiz, Flashcard } from "../types";

/**
 * Escapes values for safe CSV formatting to protect against breaks and injections.
 */
function escapeCsvValue(val: any): string {
  if (val === undefined || val === null) return "";
  const str = String(val);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Sanitizes document/quiz titles to make them safe as local filenames.
 */
function sanitizeFilename(name: string): string {
  if (!name) return "export";
  return name.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase().slice(0, 55);
}

/**
 * Common browser-compliant download trigger.
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports a Practice Quiz to a formatted CSV file.
 */
export function exportQuizToCSV(quiz: Quiz, documentTitle: string) {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    alert("No quiz questions available to export.");
    return;
  }

  const headers = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer", "Explanation"];

  const rows = quiz.questions.map((q) => {
    const optA = q.options[0] || "";
    const optB = q.options[1] || "";
    const optC = q.options[2] || "";
    const optD = q.options[3] || "";
    const correctLetter = String.fromCharCode(65 + q.correctAnswerIndex);

    return [
      q.text || "",
      optA,
      optB,
      optC,
      optD,
      correctLetter,
      q.explanation || ""
    ];
  });

  const csvContent = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map(row => row.map(escapeCsvValue).join(","))
  ].join("\n");

  const fallbackTitle = quiz.title || "practice_quiz";
  downloadFile(csvContent, `${sanitizeFilename(documentTitle || fallbackTitle)}_quiz.csv`, "text/csv;charset=utf-8;");
}

/**
 * Exports a Practice Quiz to a structured, multi-page vector PDF file.
 */
export function exportQuizToPDF(quiz: Quiz, documentTitle: string) {
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    alert("No quiz questions available to export.");
    return;
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const maxContentWidth = pageWidth - (margin * 2);

  let y = 15;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > 275) {
      pdf.addPage();
      y = 15;
    }
  };

  const addWrappedText = (
    text: string, 
    fontSize: number, 
    style: "normal" | "bold" | "italic" = "normal", 
    color: [number, number, number] = [0, 0, 0], 
    leading = 5
  ) => {
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", style);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(text, maxContentWidth);
    const totalHeight = lines.length * leading;
    
    checkPageBreak(totalHeight);
    
    for (const line of lines) {
      pdf.text(line, margin, y);
      y += leading;
    }
    y += 2;
  };

  // Header Section
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "italic");
  pdf.setTextColor(110, 110, 110);
  pdf.text(`StudyMate AI • Guidance Material`, margin, y);
  y += 5;

  addWrappedText(`Source Document: ${documentTitle || "Imported Study Guide"}`, 10, "italic", [100, 110, 120]);
  addWrappedText(quiz.title || "Custom Practice Assessment Test", 18, "bold", [15, 23, 42]);
  
  // Horizontal Rule line
  pdf.setDrawColor(218, 224, 233);
  pdf.line(margin, y, margin + maxContentWidth, y);
  y += 8;

  quiz.questions.forEach((q, idx) => {
    // Questions heading
    addWrappedText(`Question ${idx + 1}: ${q.text}`, 11, "bold", [30, 41, 59], 5.5);

    // Dynamic options listing
    q.options.forEach((opt, oIdx) => {
      const optionLetter = String.fromCharCode(65 + oIdx);
      addWrappedText(`  ${optionLetter}) ${opt}`, 10, "normal", [75, 85, 99], 5);
    });

    // Correct Answer block
    const correctLetter = String.fromCharCode(65 + q.correctAnswerIndex);
    const correctVal = q.options[q.correctAnswerIndex] || "";
    addWrappedText(`  Correct Answer: [${correctLetter}] - ${correctVal}`, 10, "bold", [16, 124, 65], 5);

    // Explanation
    if (q.explanation) {
      addWrappedText(`  Explanation: ${q.explanation}`, 9, "italic", [100, 110, 125], 4.5);
    }

    y += 2;

    // Line break between questions unless it's the last one
    if (idx < quiz.questions.length - 1) {
      checkPageBreak(10);
      pdf.setDrawColor(241, 245, 249);
      pdf.line(margin, y, margin + maxContentWidth, y);
      y += 6;
    }
  });

  const fallbackTitle = quiz.title || "practice_quiz";
  pdf.save(`${sanitizeFilename(documentTitle || fallbackTitle)}_quiz.pdf`);
}

/**
 * Exports Flashcards to a formatted CSV file.
 */
export function exportFlashcardsToCSV(flashcards: Flashcard[], documentTitle: string) {
  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    alert("No flashcards available to export.");
    return;
  }

  const headers = ["Front", "Back", "Leitner Box"];

  const rows = flashcards.map((c) => [
    c.front || "",
    c.back || "",
    c.boxIndex !== undefined ? String(c.boxIndex) : "0"
  ]);

  const csvContent = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map(row => row.map(escapeCsvValue).join(","))
  ].join("\n");

  downloadFile(csvContent, `${sanitizeFilename(documentTitle)}_flashcards.csv`, "text/csv;charset=utf-8;");
}

/**
 * Exports Flashcards to a beautiful rounded-corner card-block PDF file.
 */
export function exportFlashcardsToPDF(flashcards: Flashcard[], documentTitle: string) {
  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    alert("No flashcards available to export.");
    return;
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const maxContentWidth = pageWidth - (margin * 2);

  let y = 15;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > 275) {
      pdf.addPage();
      y = 15;
    }
  };

  // Header Section
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "italic");
  pdf.setTextColor(110, 110, 110);
  pdf.text(`StudyMate AI • Flashcard Deck`, margin, y);
  y += 5;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "italic");
  pdf.setTextColor(100, 110, 120);
  pdf.text(`Source Document: ${documentTitle || "Imported Study Guide"}`, margin, y);
  y += 5;

  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.text("Revision Study Cards", margin, y);
  y += 6;

  pdf.setDrawColor(218, 224, 233);
  pdf.line(margin, y, margin + maxContentWidth, y);
  y += 8;

  flashcards.forEach((card, idx) => {
    const frontLines = pdf.splitTextToSize(`Front Prompt: ${card.front || ""}`, maxContentWidth - 10);
    const backLines = pdf.splitTextToSize(`Back Definition: ${card.back || ""}`, maxContentWidth - 10);

    const cardLeading = 5;
    const padding = 6;
    const bodyHeight = (frontLines.length + backLines.length) * cardLeading + 3;
    const boxHeight = bodyHeight + (padding * 2) + 8;

    checkPageBreak(boxHeight + 6);

    // Render outer card outline
    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.setFillColor(248, 250, 252);  // slate-50 background for card
    pdf.roundedRect(margin, y, maxContentWidth, boxHeight, 3.5, 3.5, "FD");

    const boxStartY = y;
    y += padding + 3;

    // Header label inside card container
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(79, 70, 229); // Beautiful Indigo
    pdf.text(`STUDY CARD #${idx + 1}`, margin + padding, y);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Leitner Mastery: Box ${card.boxIndex !== undefined ? card.boxIndex : 0}`, margin + maxContentWidth - padding - 35, y);

    y += 5;

    // Card Front details
    pdf.setFontSize(9.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 41, 59);
    frontLines.forEach((line: string) => {
      pdf.text(line, margin + padding + 2, y);
      y += cardLeading;
    });

    y += 2.5;

    // Card Back details
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(71, 85, 105);
    backLines.forEach((line: string) => {
      pdf.text(line, margin + padding + 2, y);
      y += cardLeading;
    });

    // Slide cursor below card for future iterations
    y = boxStartY + boxHeight + 6;
  });

  pdf.save(`${sanitizeFilename(documentTitle)}_flashcards.pdf`);
}
