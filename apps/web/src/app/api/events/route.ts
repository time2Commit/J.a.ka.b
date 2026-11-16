import { boardEvents } from "@/server/board-events";
import { sessionFromHeaders } from "@/lib/session";
import { isDeactivated } from "@/lib/session-user";

export const dynamic = "force-dynamic";

/** The person a stream belongs to, or null when their session is over or their account deactivated. */
async function streamOwner(headers: Headers) {
  const session = await sessionFromHeaders(headers).catch(() => null);
  return session && !isDeactivated(session) ? session.user.id : null;
}

/** True when a board event says that this person's account changed (deactivated, password reset). */
function concernsAccount(payload: string, userId: string) {
  try {
    const { entity, id } = JSON.parse(payload) as { entity?: unknown; id?: unknown };
    return entity === "user" && id === userId;
  } catch {
    return false;
  }
}

/**
 * Server-Sent Events: one `board` event per Postgres NOTIFY, plus a heartbeat.
 *
 * A stream outlives the check made when it opened, so the session is checked again at every
 * heartbeat and as soon as an event about the person's own account arrives: a signed-out or
 * deactivated person stops receiving what happens on the board.
 */
export async function GET(req: Request) {
  const userId = await streamOwner(req.headers);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      let checking = false;
      const closeIfSignedOut = async () => {
        if (checking) return;
        checking = true;
        try {
          if ((await streamOwner(req.headers)) !== userId) cleanup();
        } finally {
          checking = false;
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = boardEvents.subscribe((payload) => {
        send(`event: board\ndata: ${payload}\n\n`);
        if (concernsAccount(payload, userId)) void closeIfSignedOut();
      });
      const heartbeat = setInterval(() => {
        send(": ping\n\n");
        void closeIfSignedOut();
      }, 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
