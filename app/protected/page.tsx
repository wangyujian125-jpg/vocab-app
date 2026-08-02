"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProtectedPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/auth/login");
      } else {
        setUserEmail(data.user.email ?? null);
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-8 items-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-blue-50 text-sm p-3 px-5 rounded-md text-blue-700 flex gap-3 items-center">
          ✅ 已登录：{userEmail}
        </div>
        <button
          onClick={() => router.push("/")}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
        >
          返回应用
        </button>
      </div>
    </div>
  );
}
