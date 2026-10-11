import { isStrongEnoughPassword, isValidEmail } from "@/lib/auth-validation";

export type AuthMode = "signin" | "signup" | "forgot";
export type AuthResponse = { error: boolean; session?: boolean };
export type AuthDriver = {
  signIn(email: string, password: string): Promise<AuthResponse>;
  signUp(email: string, password: string, displayName: string, redirectTo: string): Promise<AuthResponse>;
  resetPassword(email: string, redirectTo: string): Promise<AuthResponse>;
};
export type AuthOutcome = "signed-in" | "confirmation-sent" | "reset-sent" | "invalid-email" | "weak-password" | "name-too-long" | "failed";

export async function runAuthWorkflow(mode: AuthMode, values: { email: string; password: string; displayName: string; redirectTo: string; resetRedirectTo: string }, driver: AuthDriver): Promise<AuthOutcome> {
  if (!isValidEmail(values.email)) return "invalid-email";
  if (mode !== "forgot" && !isStrongEnoughPassword(values.password)) return "weak-password";
  if (mode === "signup" && values.displayName.length > 120) return "name-too-long";
  try {
    const result = mode === "signin"
      ? await driver.signIn(values.email, values.password)
      : mode === "signup"
        ? await driver.signUp(values.email, values.password, values.displayName, values.redirectTo)
        : await driver.resetPassword(values.email, values.resetRedirectTo);
    if (result.error) return "failed";
    if (mode === "signin" || result.session) return "signed-in";
    return mode === "signup" ? "confirmation-sent" : "reset-sent";
  } catch { return "failed"; }
}

export async function runSignOut(operation: () => Promise<boolean>): Promise<boolean> {
  try { return await operation(); } catch { return false; }
}
