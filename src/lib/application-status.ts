export const APPLICATION_STATUSES = ["Interested", "Preparing", "Applied", "Interviewing", "Offer", "Rejected", "Withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
