import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { job } = await request.json();

  if (!["signals", "morning-brief"].includes(job)) {
    return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const baseUrl = request.nextUrl.origin;
  const cronUrl = `${baseUrl}/api/cron/${job}`;

  try {
    const res = await fetch(cronUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Cron job failed: ${res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
