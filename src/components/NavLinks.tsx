"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function NavLinks() {
  const path = usePathname();

  function navLink(href: string, label: string) {
    const active = path === href;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "rounded-md px-2.5 py-1.5 text-sm font-medium transition duration-150 ease-out sm:px-3",
          active
            ? "bg-ink-800 text-amber-brand"
            : "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
        )}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav className="flex items-center gap-1">
      {navLink("/", "Build")}
      {navLink("/compare", "Compare")}
      {navLink("/browse", "Browse")}
    </nav>
  );
}
