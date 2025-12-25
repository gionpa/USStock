import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rawApiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
const normalizedApiUrl = rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://')
  ? rawApiUrl
  : `https://${rawApiUrl}`;
const apiBase = normalizedApiUrl.replace(/\/+$/, '').replace(/\/api$/, '');

async function proxyRequest(
  req: NextRequest,
  params: { path?: string[] },
): Promise<NextResponse> {
  const path = params.path?.join('/') ?? '';
  const upstreamUrl = `${apiBase}/api/${path}${req.nextUrl.search}`;
  const requestOrigin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const upstreamOrigin = new URL(apiBase).origin;

  if (upstreamOrigin === requestOrigin) {
    return NextResponse.json(
      { error: 'API_URL points to the web origin, causing a proxy loop.' },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const keepHeaders = [
    'accept',
    'authorization',
    'content-type',
    'cookie',
    'user-agent',
  ];
  for (const key of keepHeaders) {
    const value = req.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  const body = req.method === 'GET' || req.method === 'HEAD'
    ? undefined
    : await req.arrayBuffer();

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function OPTIONS(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function HEAD(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx.params);
}
