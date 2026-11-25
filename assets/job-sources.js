(() => {
  const requestTimeoutMs = 15000;
  const syncIntervalMs = 60 * 60 * 1000;
  const sources = [
    { id: "arbeitnow", name: "Arbeitnow", endpoint: "https://www.arbeitnow.com/api/job-board-api?page=1" },
    { id: "remoteok", name: "RemoteOK", endpoint: "https://remoteok.com/api" },
    { id: "jobicy", name: "Jobicy", endpoint: "https://jobicy.com/api/jobs" }
  ];

  const countryRegions = {
    argentina: "latam", australia: "apac", austria: "europe", belgium: "europe", brazil: "latam",
    bulgaria: "europe", canada: "north america", china: "apac", croatia: "europe", cyprus: "europe",
    czechia: "europe", denmark: "europe", estonia: "europe", finland: "europe", france: "europe",
    germany: "europe", greece: "europe", "hong kong": "apac", hungary: "europe", india: "apac",
    indonesia: "apac", ireland: "europe", israel: "middle east", italy: "europe", japan: "apac",
    latvia: "europe", lithuania: "europe", malaysia: "apac", mexico: "north america",
    netherlands: "europe", "new zealand": "apac", norway: "europe", philippines: "apac",
    poland: "europe", portugal: "europe", romania: "europe", serbia: "europe", singapore: "apac",
    slovakia: "europe", slovenia: "europe", "south korea": "apac", spain: "europe", sweden: "europe",
    switzerland: "europe", thailand: "apac", turkey: "europe", ukraine: "europe",
    "united arab emirates": "middle east", "united kingdom": "europe", "united states": "north america",
    usa: "north america", vietnam: "apac"
  };
  const locationAliases = {
    apac: "apac", asia: "apac", "asia pacific": "apac",
    europe: "europe", emea: "europe", latam: "latam", "latin america": "latam",
    "north america": "north america", worldwide: "worldwide", global: "worldwide", anywhere: "worldwide",
    uk: "united kingdom", britain: "united kingdom", us: "united states", usa: "united states",
    "us only": "united states", "united states only": "united states",
    uae: "united arab emirates", dubai: "united arab emirates", "abu dhabi": "united arab emirates",
    london: "united kingdom", berlin: "germany", paris: "france", amsterdam: "netherlands",
    dublin: "ireland", tokyo: "japan", seoul: "south korea", sydney: "australia",
    toronto: "canada", "new york": "united states", "san francisco": "united states",
    bangalore: "india", bengaluru: "india", mumbai: "india", delhi: "india", "new delhi": "india",
    hyderabad: "india", chennai: "india", pune: "india", kolkata: "india", noida: "india",
    gurgaon: "india", gurugram: "india", kochi: "india"
  };
  const jobicyGeo = {
    argentina: "argentina", australia: "australia", austria: "austria", belgium: "belgium",
    brazil: "brazil", bulgaria: "bulgaria", canada: "canada", china: "china",
    croatia: "croatia", cyprus: "cyprus", czechia: "czechia", denmark: "denmark",
    estonia: "estonia", finland: "finland", france: "france", germany: "germany",
    greece: "greece", "hong kong": "hong-kong", hungary: "hungary", india: "apac",
    indonesia: "indonesia", ireland: "ireland", israel: "israel", italy: "italy",
    japan: "japan", latvia: "latvia", lithuania: "lithuania", malaysia: "malaysia",
    mexico: "mexico", netherlands: "netherlands", "new zealand": "new-zealand",
    norway: "norway", philippines: "philippines", poland: "poland", portugal: "portugal",
    romania: "romania", serbia: "serbia", singapore: "singapore", slovakia: "slovakia",
    slovenia: "slovenia", "south korea": "south-korea", spain: "spain", sweden: "sweden",
    switzerland: "switzerland", thailand: "thailand", turkey: "turkey", ukraine: "ukraine",
    "united arab emirates": "united-arab-emirates", "united kingdom": "uk",
    "united states": "usa", vietnam: "vietnam", apac: "apac", europe: "europe",
    worldwide: "anywhere", global: "anywhere", anywhere: "anywhere"
  };

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function toStrings(value) {
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  }

  function stripHtml(value) {
    const document = new DOMParser().parseFromString(String(value || ""), "text/html");
    document.querySelectorAll("script, style").forEach((element) => element.remove());
    return (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 8000);
  }

  function normalizeDate(value, seconds) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(seconds ? value * 1000 : value).toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      const date = Number.isFinite(numeric)
        ? new Date(seconds || numeric < 1000000000000 ? numeric * 1000 : numeric)
        : new Date(value);
      return Number.isFinite(date.getTime()) ? date.toISOString() : "";
    }
    return "";
  }

  function validHttpsUrl(value, sourceName) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return url.href;
    } catch {
      // Invalid source links are omitted instead of making a listing clickable.
    }
    throw new Error(`${sourceName} returned a listing without a valid HTTPS source URL.`);
  }

  function makeLocationScopes(values, sourceName) {
    const scopes = values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
    if (sourceName === "Arbeitnow") scopes.push("Europe");
    return [...new Set(scopes)];
  }

  function normalizeArbeitnowJob(row) {
    if (!row || typeof row.slug !== "string" || typeof row.title !== "string" ||
        typeof row.company_name !== "string" || typeof row.url !== "string") {
      throw new Error("Arbeitnow returned an invalid job record.");
    }
    const tags = toStrings(row.tags);
    const jobTypes = toStrings(row.job_types);
    const location = typeof row.location === "string" && row.location.trim() ? row.location.trim() : "Location not specified";
    return {
      id: `arbeitnow-${row.slug}`,
      title: row.title.trim(),
      company: row.company_name.trim(),
      city: row.remote ? `${location} · Remote` : location,
      locationScopes: makeLocationScopes([location], "Arbeitnow"),
      type: tags[0] || jobTypes[0] || "Other",
      level: jobTypes.join(" "),
      expMin: 0,
      expMax: 40,
      experienceSpecified: false,
      salary: "Not specified",
      posted: normalizeDate(row.created_at, true),
      skills: [...tags, ...jobTypes].map(normalizeText).filter(Boolean),
      description: typeof row.description === "string" ? stripHtml(row.description) : "No description provided.",
      applyUrl: validHttpsUrl(row.url, "Arbeitnow"),
      sourceName: "Arbeitnow"
    };
  }

  function normalizeRemoteOkJob(row) {
    if (!row || (typeof row.id !== "string" && typeof row.id !== "number") ||
        typeof row.position !== "string" || typeof row.company !== "string") {
      throw new Error("RemoteOK returned an invalid job record.");
    }
    const tags = toStrings(row.tags);
    const location = typeof row.location === "string" && row.location.trim() ? row.location.trim() : "Remote";
    const min = Number(row.salary_min);
    const max = Number(row.salary_max);
    const salary = min > 0 && max > 0
      ? `USD ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(min)}–${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(max)}`
      : "Not specified";
    return {
      id: `remoteok-${row.id}`,
      title: row.position.trim(),
      company: row.company.trim(),
      city: location,
      locationScopes: makeLocationScopes([location], "RemoteOK"),
      type: tags[0] || "Remote",
      level: tags.join(" "),
      expMin: 0,
      expMax: 40,
      experienceSpecified: false,
      salary,
      posted: normalizeDate(row.date),
      skills: tags.map(normalizeText).filter(Boolean),
      description: typeof row.description === "string" ? stripHtml(row.description) : "No description provided.",
      applyUrl: validHttpsUrl(row.url, "RemoteOK"),
      sourceName: "RemoteOK"
    };
  }

  function normalizeJobicyJob(row) {
    if (!row || (typeof row.id !== "string" && typeof row.id !== "number") ||
        typeof row.jobTitle !== "string" || typeof row.companyName !== "string" || typeof row.url !== "string") {
      throw new Error("Jobicy returned an invalid job record.");
    }
    const geographies = toStrings(row.jobGeo);
    const city = typeof row.jobCity === "string" && row.jobCity.trim()
      ? `${row.jobCity.trim()}${geographies.length ? `, ${geographies.join(", ")}` : ""}`
      : geographies.join(", ") || "Remote";
    const industries = toStrings(row.jobIndustry);
    const types = toStrings(row.jobType);
    const description = typeof row.jobExcerpt === "string" && row.jobExcerpt.trim()
      ? stripHtml(row.jobExcerpt)
      : typeof row.jobDescription === "string" ? stripHtml(row.jobDescription) : "No description provided.";
    const min = Number(row.salaryMin);
    const max = Number(row.salaryMax);
    const currency = typeof row.salaryCurrency === "string" && /^[A-Z]{3}$/i.test(row.salaryCurrency)
      ? row.salaryCurrency.toUpperCase()
      : "";
    const salary = min > 0 && max > 0
      ? `${currency ? `${currency} ` : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(min)}–${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(max)}${row.salaryPeriod ? ` / ${String(row.salaryPeriod).slice(0, 30)}` : ""}`
      : "Not specified";
    return {
      id: `jobicy-${row.id}`,
      title: row.jobTitle.trim(),
      company: row.companyName.trim(),
      city,
      locationScopes: makeLocationScopes(geographies, "Jobicy"),
      type: types[0] || industries[0] || "Remote",
      level: [row.jobLevel, ...types].filter((value) => typeof value === "string").join(" "),
      expMin: 0,
      expMax: 40,
      experienceSpecified: false,
      salary,
      posted: normalizeDate(row.pubDate),
      skills: industries.map(normalizeText).filter(Boolean),
      description,
      applyUrl: validHttpsUrl(row.url, "Jobicy"),
      sourceName: "Jobicy"
    };
  }

  async function fetchJson(url, sourceName, cacheMode) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        cache: cacheMode || "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`${sourceName} returned HTTP ${response.status}.`);
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${sourceName} request timed out after 15 seconds.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function fetchArbeitnow() {
    const response = await fetchJson(sources[0].endpoint, "Arbeitnow");
    if (!response || !Array.isArray(response.data)) throw new Error("Arbeitnow returned an unexpected jobs response.");
    return response.data.map(normalizeArbeitnowJob);
  }

  async function fetchRemoteOk() {
    const response = await fetchJson(sources[1].endpoint, "RemoteOK");
    if (!Array.isArray(response)) throw new Error("RemoteOK returned an unexpected jobs response.");
    return response.filter((row) => row && (row.id || row.position)).map(normalizeRemoteOkJob);
  }

  function resolveLocation(value) {
    const normalized = normalizeText(value);
    if (!normalized) return "";
    const alias = locationAliases[normalized];
    if (alias) return alias;
    const aliasSuffix = Object.keys(locationAliases).find((name) => normalized.endsWith(` ${name}`));
    if (aliasSuffix) return locationAliases[aliasSuffix];
    const country = Object.keys(countryRegions).find((name) => normalized === name);
    if (country) return country;
    const countrySuffix = Object.keys(countryRegions).find((name) => normalized.endsWith(` ${name}`));
    return countrySuffix || normalized;
  }

  function jobicyGeoFor(value) {
    const location = resolveLocation(value);
    const region = countryRegions[location];
    if (location === "india") return "apac";
    if (location === "europe") return "europe";
    if (location === "apac") return "apac";
    return jobicyGeo[location] || (region === "apac" ? "apac" : "");
  }

  function jobicyFiltersUrl(filters) {
    const params = new URLSearchParams({ count: "100" });
    const keyword = String(filters.keyword || "").trim();
    if (keyword) params.set("tag", keyword.slice(0, 50));
    const geo = jobicyGeoFor(filters.location);
    if (geo) params.set("geo", geo);
    return `${sources[2].endpoint}?${params.toString()}`;
  }

  async function fetchJobicy(filters) {
    const response = await fetchJson(jobicyFiltersUrl(filters), "Jobicy");
    if (!response || !Array.isArray(response.jobs)) throw new Error("Jobicy returned an unexpected jobs response.");
    return response.jobs.map(normalizeJobicyJob);
  }

  function searchKey(filters) {
    return JSON.stringify({
      keyword: normalizeText(filters.keyword),
      location: normalizeText(filters.location)
    });
  }

  function sourceCachedJobs(allJobs, source) {
    return allJobs.filter((job) => job && job.sourceName === source.name);
  }

  async function loadSource(source, allCachedJobs, filters) {
    const cached = sourceCachedJobs(allCachedJobs, source);
    const now = Date.now();
    let state;
    try {
      state = await window.TestoraDeviceStore.getSourceState(source.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not read the source refresh state.";
      throw new Error(`${source.name} refresh state is unavailable: ${reason}`);
    }

    const requestKey = source.id === "jobicy" ? searchKey(filters) : "";
    const lastAttempt = Number(state && state.lastAttemptAt) || 0;
    const lastSuccess = Number(state && state.lastSuccessAt) || 0;
    const nextAllowed = Number(state && state.nextAllowedAt) || lastAttempt + syncIntervalMs;
    const isFresh = now < nextAllowed;
    const sourceQueryChanged = source.id === "jobicy" && state && state.queryKey !== requestKey;

    if (isFresh) {
      return {
        jobs: cached,
        warning: sourceQueryChanged && cached.length
          ? `${source.name} is limited to one refresh per hour; its cached listings are from a different search.`
          : "",
        refreshed: false
      };
    }
    if (source.id === "jobicy" && !filters.keyword && !filters.location && !cached.length) {
      return { jobs: [], warning: "", refreshed: false };
    }

    const attemptedAt = Date.now();
    try {
      const jobs = source.id === "arbeitnow"
        ? await fetchArbeitnow()
        : source.id === "remoteok"
          ? await fetchRemoteOk()
          : await fetchJobicy(filters);
      await window.TestoraDeviceStore.saveSourceState({
        id: source.id,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: Date.now(),
        nextAllowedAt: Date.now() + syncIntervalMs,
        queryKey: requestKey
      });
      return { jobs, warning: "", refreshed: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown feed error.";
      const retryDelay = error && Number.isFinite(error.retryAfterMs)
        ? Math.max(syncIntervalMs, error.retryAfterMs)
        : syncIntervalMs;
      try {
        await window.TestoraDeviceStore.saveSourceState({
          id: source.id,
          lastAttemptAt: attemptedAt,
          lastSuccessAt: lastSuccess,
          nextAllowedAt: attemptedAt + retryDelay,
          queryKey: requestKey
        });
      } catch (stateError) {
        const stateReason = stateError instanceof Error ? stateError.message : "Could not save refresh state.";
        return {
          jobs: cached,
          warning: `${source.name} failed: ${reason} Refresh state could not be saved: ${stateReason}`,
          refreshed: false
        };
      }
      return {
        jobs: cached,
        warning: `${source.name} failed: ${reason}${cached.length ? " Cached listings are shown." : ""}`,
        refreshed: false
      };
    }
  }

  function deduplicate(jobs) {
    const byId = new Map();
    jobs.forEach((job) => {
      if (job && job.id && !byId.has(job.id)) byId.set(job.id, job);
    });
    return [...byId.values()].sort((a, b) => new Date(b.posted || 0) - new Date(a.posted || 0));
  }

  async function loadAll(filters, cachedJobs) {
    const safeFilters = {
      keyword: String(filters && filters.keyword || ""),
      location: String(filters && filters.location || "")
    };
    const results = await Promise.all(sources.map(async (source) => {
      try {
        return await loadSource(source, cachedJobs, safeFilters);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown source error.";
        return {
          jobs: sourceCachedJobs(cachedJobs, source),
          warning: `${source.name} was skipped: ${reason}`,
          refreshed: false
        };
      }
    }));
    const jobs = deduplicate(results.flatMap((result) => result.jobs));
    const loadedSources = [...new Set(jobs.map((job) => job.sourceName))];
    return {
      jobs,
      loadedSources,
      refreshedSources: sources.filter((source, index) => results[index].refreshed).map((source) => source.name),
      warnings: [...new Set(results.map((result) => result.warning).filter(Boolean))]
    };
  }

  function matchesLocation(job, value) {
    const query = normalizeText(value);
    if (!query) return true;
    const city = normalizeText(job.city);
    const scopes = Array.isArray(job.locationScopes) ? job.locationScopes.map(normalizeText) : [];
    if (city.includes(query) || scopes.some((scope) => scope.includes(query))) return true;

    const resolved = resolveLocation(value);
    const resolvedScopes = scopes.map(resolveLocation);
    if (city.includes(normalizeText(resolved)) || resolvedScopes.includes(resolved)) return true;
    const queryRegion = countryRegions[resolved];
    const globalScopes = ["anywhere", "worldwide", "global"];
    if (globalScopes.some((scope) => scopes.includes(scope))) return true;
    if (queryRegion && scopes.includes(queryRegion)) return true;
    if (resolved === "europe" || resolved === "apac" || resolved === "latam" || resolved === "north america") {
      return scopes.some((scope) => countryRegions[scope] === resolved);
    }
    return false;
  }

  window.TestoraJobSources = { loadAll, matchesLocation };
})();
