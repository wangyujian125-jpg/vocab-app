"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <>
      {error ? (
        <p className="text-sm text-muted-foreground">
          错误代码：{error}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">发生了未知错误。</p>
      )}
    </>
  );
}

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">抱歉，出了点问题。</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense>
                <ErrorContent />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
