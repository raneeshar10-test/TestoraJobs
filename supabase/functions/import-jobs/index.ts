import { withSupabase } from "npm:@supabase/server@1";

const MAX_SOURCES = 25;
const MAX_JOBS_PER_FEED = 1000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 20000;

type FeedSource = {
  id: string;
  name: string;
  feed_url: string;
  auth_header_name: string | null;
  auth_secret_name: string | null;
};

type ImportedJob = {
  source_id: string;
  external_id: string;
  title: string;
  company: string;
  city: string;
  job_type: string;
  experience_min: number;
  experience_max: number;
  salary: string | null;
  posted_at: string;
  skills: string[];
  description: string;
  source_url: string | null;
  apply_url: string | null;
  is_active: boolean;
  last_seen_at: string;
  updated_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    throw new Error("Feed response exceeds the 2 MB limit.");
  }
  if (!response.body) throw new Error("Feed returned an empty response body.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("Feed response exceeds the 2 MB limit.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function normalizeJob(value: unknown, sourceId: string): ImportedJob | null {
  if (!isRecord(value)) return null;
  const externalId = readText(value.external_id ?? value.id, 240);
  const title = readText(value.title, 300);
  const company = readText(value.company, 300);
  const city = readText(value.city ?? value.location, 200);
  if (!externalId || !title || !company || !city) return null;

  const minimum = Number(value.experience_min ?? 0);
  const maximum = Number(value.experience_max ?? minimum);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum || maximum > 80) return null;

  const postedDate = typeof value.posted_at === "string" ? new Date(value.posted_at) : new Date();
  const postedAt = Number.isNaN(postedDate.getTime()) ? new Date().toISOString() : postedDate.toISOString();
  const skills = Array.isArray(value.skills)
    ? value.skills.filter((skill): skill is string => typeof skill === "string").slice(0, 50).map((skill) => skill.trim().toLowerCase()).filter(Boolean)
    : [];
  const description = readText(value.description, MAX_DESCRIPTION_LENGTH);

  return {
    source_id: sourceId,
    external_id: externalId,
    title,
    company,
    city,
    job_type: readText(value.job_type, 80) || "Other",
    experience_min: minimum,
    experience_max: maximum,
    salary: readText(value.salary, 160) || null,
    posted_at: postedAt,
    skills,
    description,
    source_url: safeHttpsUrl(value.source_url),
    apply_url: safeHttpsUrl(value.apply_url),
    is_active: true,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") {
      return Response.json({ error: "POST is required." }, { status: 405 });
    }

    const allowedHosts = new Set(
      (Deno.env.get("JOB_FEED_HOSTS") || "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    );
    if (allowedHosts.size === 0) {
      return Response.json({ error: "Configure JOB_FEED_HOSTS with the exact HTTPS hostnames of authorized feeds." }, { status: 500 });
    }

    const { data, error } = await context.supabaseAdmin
      .from("job_sources")
      .select("id,name,feed_url,auth_header_name,auth_secret_name")
      .eq("enabled", true)
      .limit(MAX_SOURCES + 1);
    if (error) {
      return Response.json({ error: `Could not load configured job sources: ${error.message}` }, { status: 500 });
    }

    const sources = (data || []) as FeedSource[];
    if (sources.length > MAX_SOURCES) {
      return Response.json({ error: `Configure no more than ${MAX_SOURCES} active feeds per scheduled run.` }, { status: 422 });
    }
    if (sources.length === 0) {
      return Response.json({ error: "No active feeds are configured in public.job_sources." }, { status: 422 });
    }
    const results: Array<{ source: string; status: string; imported: number; rejected: number; error?: string }> = [];
    const allowlist = allowedHosts;

    for (const source of sources) {
      const startedAt = new Date().toISOString();
      let status = "succeeded";
      let imported = 0;
      let rejected = 0;
      let errorMessage = "";

      try {
        const feedUrl = new URL(source.feed_url);
        if (feedUrl.protocol !== "https:" || (feedUrl.port && feedUrl.port !== "443") || !allowlist.has(feedUrl.hostname.toLowerCase())) {
          throw new Error("Feed URL must use HTTPS and an explicitly allowed hostname.");
        }

        const headers: Record<string, string> = { Accept: "application/json" };
        if (source.auth_header_name && source.auth_secret_name) {
          if (!/^[A-Za-z0-9-]{1,60}$/.test(source.auth_header_name) || !/^[A-Z][A-Z0-9_]{2,63}$/.test(source.auth_secret_name)) {
            throw new Error("Feed authentication metadata is invalid.");
          }
          const secret = Deno.env.get(source.auth_secret_name);
          if (!secret) throw new Error(`Configure the Edge Function secret ${source.auth_secret_name}.`);
          headers[source.auth_header_name] = secret;
        }

        const response = await fetch(feedUrl, {
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
        const body = await readBoundedBody(response);
        const payload: unknown = JSON.parse(new TextDecoder().decode(body));
        if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
          throw new Error('Feed must return a JSON object with a "jobs" array.');
        }
        if (payload.jobs.length > MAX_JOBS_PER_FEED) {
          throw new Error(`Feed exceeds the ${MAX_JOBS_PER_FEED} jobs-per-run limit.`);
        }

        const uniqueJobs = new Map<string, ImportedJob>();
        for (const item of payload.jobs) {
          const job = normalizeJob(item, source.id);
          if (!job || uniqueJobs.has(job.external_id)) {
            rejected += 1;
            continue;
          }
          uniqueJobs.set(job.external_id, job);
        }

        const records = [...uniqueJobs.values()];
        if (records.length) {
          const { error: upsertError } = await context.supabaseAdmin
            .from("jobs")
            .upsert(records, { onConflict: "source_id,external_id" });
          if (upsertError) throw new Error(`Could not save imported jobs: ${upsertError.message}`);
        }
        imported = records.length;
        if (rejected) status = "partial";
      } catch (error) {
        status = "failed";
        errorMessage = error instanceof Error ? error.message : "Unknown feed error.";
      }

      const { error: logError } = await context.supabaseAdmin.from("job_import_runs").insert({
        source_id: source.id,
        started_at: startedAt,
        status,
        imported_count: imported,
        rejected_count: rejected,
        error_message: errorMessage || null
      });
      if (logError) {
        results.push({ source: source.name, status: "failed", imported, rejected, error: `Import log could not be saved: ${logError.message}` });
      } else {
        results.push({ source: source.name, status, imported, rejected, ...(errorMessage ? { error: errorMessage } : {}) });
      }
    }

    return Response.json({
      ok: results.every((result) => result.status === "succeeded"),
      sourceCount: sources.length,
      results
    }, { status: results.every((result) => result.status === "failed") ? 502 : 200 });
  })
};
