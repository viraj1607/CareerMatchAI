export type ResumeDocumentType = "pdf" | "docx";

export type ResumeParseSuccess = {
  fileName: string;
  fileType: ResumeDocumentType;
  fileSizeBytes: number;
  text: string;
};

export type ResumeParseErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE"
  | "MALFORMED_DOCUMENT"
  | "PASSWORD_PROTECTED"
  | "NO_SELECTABLE_TEXT"
  | "EMPTY_DOCUMENT"
  | "TOO_MANY_PAGES"
  | "TEXT_TOO_LARGE"
  | "PROCESSING_TIMEOUT";

export type ResumeParseError = { error: { code: ResumeParseErrorCode; message: string } };
export type ResumeParseResponse = ResumeParseSuccess | ResumeParseError;
