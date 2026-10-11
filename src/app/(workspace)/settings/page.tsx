import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { SettingsPreferences } from "@/components/settings-preferences";
import { AccountSettings } from "@/components/account-settings";
import { requireUser } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const { user, supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return (
    <>
      <PageHeading
        title="Settings"
        description="Set the market and document preferences you want to use in your career workspace."
      />

      <div className="grid gap-8 xl:grid-cols-[0.75fr_1.25fr]">
        <AccountSettings email={user.email ?? ""} displayName={profile?.display_name ?? ""} />

        <SettingsPreferences />
      </div>


      <section aria-labelledby="privacy-heading" className="mt-9 border-t border-[#dfe7e1] pt-7">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-[#eef4f0] text-[#36745a]"><Icon name="shield" size={18} /></span>
          <div>
            <h2 id="privacy-heading" className="text-base font-semibold text-[#25372d]">Data and privacy</h2>
            <p className="mt-1 text-sm text-[#65756b]">Your saved account data remains private to you.</p>
          </div>
        </div>
        <ul className="mt-5 grid gap-4 border-t border-[#e4ebe6] pt-5 md:grid-cols-3">
          <li className="text-sm leading-6 text-[#64736a]">Saved resumes store extracted text and structured content in your private account. Uploaded PDF/DOCX binaries are discarded after parsing.</li>
          <li className="text-sm leading-6 text-[#64736a]">Job descriptions, reviewed requirements, match history, and applications are private to this authenticated account through PostgreSQL row-level security.</li>
          <li className="text-sm leading-6 text-[#64736a]">Saving content does not consent to Gemini processing. AI requests retain their separate, per-request consent.</li>
        </ul>
      </section>
    </>
  );
}
