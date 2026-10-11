"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { initialResumeEditorState, resumeEditorReducer, resumeContentToText, type ResumeContent, type ResumeEditorState, type ResumeSuggestion } from "@/lib/resume-editor";
import { initialResumeAnalysisWorkflow, resumeAnalysisWorkflowReducer } from "@/lib/resume-analysis-workflow";
import type { GeminiAnalysis } from "@/lib/gemini-analysis";

// The workspace layout survives client navigation; page-local state does not.
// Keep only the in-memory draft here, never credentials or automatic DB saves.
function useAnalysisDraft() {
  const [workflow, dispatchWorkflow] = useReducer(resumeAnalysisWorkflowReducer, initialResumeAnalysisWorkflow);
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [savedResumeId, setSavedResumeId] = useState("");
  const [geminiResult, setGeminiResult] = useState<GeminiAnalysis | null>(null);
  const [geminiStale, setGeminiStale] = useState(false);
  const pendingJobId = useRef<string | null>(null);
  const getPendingJobId = useCallback(() => pendingJobId.current ??= crypto.randomUUID(), []);
  const clearPendingJobId = useCallback(() => { pendingJobId.current = null; }, []);
  const loadedJobRef = useRef<string | null>(null);
  return useMemo(() => ({ workflow, dispatchWorkflow, jobTitle, setJobTitle, companyName, setCompanyName, savedJobId, setSavedJobId, savedResumeId, setSavedResumeId, geminiResult, setGeminiResult, geminiStale, setGeminiStale, getPendingJobId, clearPendingJobId, loadedJobRef }), [workflow, jobTitle, companyName, savedJobId, savedResumeId, geminiResult, geminiStale, getPendingJobId, clearPendingJobId]);
}

type ResumeStudioValue = {
  analysis: ReturnType<typeof useAnalysisDraft>;
  state: ResumeEditorState;
  setResumeSource: (text: string, fileName: string) => void;
  setTargetContext: (description: string, requirements: Array<{ id: string; text: string }>) => void;
  updateContent: (content: ResumeContent) => void;
  addSuggestions: (suggestions: ResumeSuggestion[]) => void;
  rejectSuggestion: (id: string) => void;
  acceptSuggestion: (id: string, finalText?: string) => void;
  reset: (confirmed: boolean) => void;
  loadSavedResume: (state: ResumeEditorState) => void;
  markResumeSaved: (id: string, name: string, originalResumeId: string | null, snapshot: string) => void;
};

const ResumeStudioContext = createContext<ResumeStudioValue | null>(null);

export function ResumeStudioProvider({ children }: { children: ReactNode }) {
  const analysis = useAnalysisDraft();
  const [state, dispatch] = useReducer(resumeEditorReducer, undefined, () => initialResumeEditorState());
  const setResumeSource = useCallback((text: string, fileName: string) => dispatch({ type: "resume-source-set", text, fileName }), []);
  const setTargetContext = useCallback((description: string, requirements: Array<{ id: string; text: string }>) => dispatch({ type: "target-context-set", description, requirements }), []);
  const updateContent = useCallback((content: ResumeContent) => {
    dispatch({ type: "content-updated", content });
    if (analysis.workflow.resume) {
      const text = resumeContentToText(content);
      if (text !== analysis.workflow.resume.text) {
        analysis.dispatchWorkflow({ type: "resume-selected", resume: { ...analysis.workflow.resume, text } });
        analysis.setGeminiStale(Boolean(analysis.geminiResult));
      }
    }
  }, [analysis]);
  const addSuggestions = useCallback((suggestions: ResumeSuggestion[]) => dispatch({ type: "suggestions-added", suggestions }), []);
  const rejectSuggestion = useCallback((id: string) => dispatch({ type: "suggestion-rejected", id }), []);
  const acceptSuggestion = useCallback((id: string, finalText?: string) => dispatch({ type: "suggestion-accepted", id, finalText }), []);
  const reset = useCallback((confirmed: boolean) => dispatch({ type: "reset-confirmed", confirmed }), []);
  const loadSavedResume = useCallback((loaded: ResumeEditorState) => dispatch({ type: "resume-loaded", state: loaded }), []);
  const markResumeSaved = useCallback((id: string, name: string, originalResumeId: string | null, snapshot: string) => dispatch({ type: "resume-saved", id, name, originalResumeId, snapshot }), []);
  const value = useMemo(() => ({ state, analysis, setResumeSource, setTargetContext, updateContent, addSuggestions, rejectSuggestion, acceptSuggestion, reset, loadSavedResume, markResumeSaved }), [state, analysis, setResumeSource, setTargetContext, updateContent, addSuggestions, rejectSuggestion, acceptSuggestion, reset, loadSavedResume, markResumeSaved]);
  return <ResumeStudioContext.Provider value={value}>{children}</ResumeStudioContext.Provider>;
}

export function useResumeStudio(): ResumeStudioValue {
  const value = useContext(ResumeStudioContext);
  if (!value) throw new Error("useResumeStudio must be rendered inside ResumeStudioProvider");
  return value;
}
