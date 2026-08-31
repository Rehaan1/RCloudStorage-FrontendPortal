import { NextRequest } from "next/server";

const coordinatorUrl = () => (process.env.RCLOUD_STORAGE_URL ?? "http://localhost:9000").replace(/\/$/, "");

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = new URL(`${coordinatorUrl()}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      // Streaming uploads are supported by the coordinator; Next must opt in to duplex mode.
      // @ts-expect-error Node fetch supports this extension.
      duplex: "half",
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-length", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "Unable to reach the RCloudStorage coordinator. Check RCLOUD_STORAGE_URL." },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as PUT, proxy as DELETE };
