"use client";

import { useEffect } from "react";
import { createDatabase } from "@/lib/database";

export default function DatabaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    async function init() {
      try {
        await createDatabase();
        console.log("✅ Base SQLite initialisée");
      } catch (error) {
        console.error("❌ Erreur SQLite :", error);
      }
    }

    init();
  }, []);

  return <>{children}</>;
}