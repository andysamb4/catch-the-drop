"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleLogout() {
    setIsSigningOut(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" className="w-full" onClick={handleLogout} disabled={isSigningOut}>
      {isSigningOut ? "Signing out..." : "Sign out"}
    </Button>
  );
}
