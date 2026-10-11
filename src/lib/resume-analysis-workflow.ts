import type { ResumeParseSuccess } from "@/lib/resume-upload-types";
import type { EditableJobDescriptionAnalysis } from "@/lib/job-description-analysis";
import { setReviewedPriority, setReviewedStatus, type ResumeMatchReport, type MatchPriority, type MatchStatus } from "@/lib/resume-job-matcher";

export type ResumeAnalysisWorkflowState = {
  resume: ResumeParseSuccess | null;
  jobDescription: string;
  jobAnalysis: EditableJobDescriptionAnalysis | null;
  jobDescriptionNeedsAnalysis: boolean;
  matchReport: ResumeMatchReport | null;
  matchStale: boolean;
};

export type ResumeAnalysisWorkflowAction =
  | { type: "resume-selected"; resume: ResumeParseSuccess | null }
  | { type: "description-changed"; value: string }
  | { type: "analysis-completed"; analysis: EditableJobDescriptionAnalysis }
  | { type: "analysis-edited"; analysis: EditableJobDescriptionAnalysis }
  | { type: "match-completed"; report: ResumeMatchReport }
  | { type: "match-reviewed"; requirementId: string; status: MatchStatus | null }
  | { type: "priority-reviewed"; requirementId: string; priority: MatchPriority | null }
  | { type: "fresh-description" };

export const initialResumeAnalysisWorkflow: ResumeAnalysisWorkflowState = {
  resume: null,
  jobDescription: "",
  jobAnalysis: null,
  jobDescriptionNeedsAnalysis: false,
  matchReport: null,
  matchStale: false,
};

export function resumeAnalysisWorkflowReducer(
  state: ResumeAnalysisWorkflowState,
  action: ResumeAnalysisWorkflowAction,
): ResumeAnalysisWorkflowState {
  switch (action.type) {
    case "resume-selected":
      return { ...state, resume: action.resume, matchStale: state.matchReport ? true : state.matchStale };
    case "description-changed":
      return { ...state, jobDescription: action.value, jobDescriptionNeedsAnalysis: state.jobAnalysis ? true : state.jobDescriptionNeedsAnalysis, matchStale: state.matchReport ? true : state.matchStale };
    case "analysis-completed":
      return { ...state, jobAnalysis: action.analysis, jobDescriptionNeedsAnalysis: false, matchStale: state.matchReport ? true : state.matchStale };
    case "analysis-edited":
      return { ...state, jobAnalysis: action.analysis, matchStale: state.matchReport ? true : state.matchStale };
    case "match-completed":
      return { ...state, matchReport: action.report, matchStale: false };
    case "match-reviewed":
      return state.matchReport
        ? { ...state, matchReport: setReviewedStatus(state.matchReport, action.requirementId, action.status) }
        : state;
    case "priority-reviewed":
      return state.matchReport
        ? { ...state, matchReport: setReviewedPriority(state.matchReport, action.requirementId, action.priority) }
        : state;
    case "fresh-description":
      return { ...state, jobDescription: "", jobAnalysis: null, jobDescriptionNeedsAnalysis: false, matchStale: state.matchReport ? true : state.matchStale };
  }
}
