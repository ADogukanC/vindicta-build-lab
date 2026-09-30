import type { Metadata } from "next";
import { DISCORD_USERNAME } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Vindicta Build Lab",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <div className="panel space-y-5 p-5 text-[13px] leading-relaxed text-ink-300">
        <div>
          <h1 className="text-[18px] font-semibold text-ink-100">Privacy Policy</h1>
          <p className="mt-1 text-[11px] text-ink-500">Last updated: September 21, 2026</p>
        </div>

        <p>
          Vindicta Build Lab is a free, unofficial fan tool. This page explains what happens to
          your data — the short version is: almost nothing leaves your browser.
        </p>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">Builds you create</h2>
          <p>
            Every build you make lives in your own browser&apos;s local storage (IndexedDB). It
            never touches our servers unless you click &ldquo;Share.&rdquo;
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">Sharing a build</h2>
          <p>
            When you click Share, the build&apos;s items, sell order, imbue targets, and ability
            order are sent to our database and stored under a short random code, so the link can
            be opened later. We don&apos;t attach your name, email, or any other personal
            information to it — there&apos;s nothing to attach, since the site has no accounts. If
            you also check &ldquo;list on the build browser,&rdquo; that same data becomes publicly
            viewable and searchable by name at <code className="text-ink-200">/browse</code>. You
            can ask to have a shared or listed build removed at any time (see Contact below), and
            it&apos;s deleted outright, link included.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">What we don&apos;t collect</h2>
          <p>
            No accounts, no email addresses, no analytics or ad trackers, no marketing cookies. We
            don&apos;t sell or share data with third parties, because we don&apos;t have any to
            sell.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">Hosting</h2>
          <p>
            Like any website, our hosting provider (Vercel) and database provider (Neon) process
            standard technical data to serve requests — things like IP address and request
            timestamps, in their own server logs. We don&apos;t access or use this ourselves;
            it&apos;s retained per their own policies, not ours.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">Children</h2>
          <p>
            This site isn&apos;t directed at children and doesn&apos;t knowingly collect personal
            information from anyone.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">Changes</h2>
          <p>If this policy changes, this page will be updated with a new date above.</p>
        </section>

        <section>
          <h2 className="mb-1 text-[14px] font-medium text-ink-100">Contact</h2>
          <p>
            Questions, or want a shared build taken down? Discord:{" "}
            <span className="text-ink-200">{DISCORD_USERNAME}</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
