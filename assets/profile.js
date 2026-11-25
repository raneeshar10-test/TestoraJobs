(() => {
  const otp = { email: "", phone: "" };
  const jobs = [];
  const stored = window.TestoraProfileStore.load();
  const profile = {
    name: "",
    email: "",
    phone: "",
    verifiedEmail: "",
    verifiedPhone: "",
    skills: [],
    yearsDetected: null,
    yearsOverride: null,
    experienceYears: null,
    preferredCity: "",
    resumeName: "",
    alertsEnabled: false,
    ...(stored.profile || {})
  };
  profile.skills = Array.isArray(profile.skills) ? profile.skills.filter((skill) => typeof skill === "string") : [];

  const $ = (id) => document.getElementById(id);
  let currentCvFile = null;
  const toast = (message) => {
    const element = $("toast");
    element.textContent = message;
    element.style.display = "block";
    setTimeout(() => { element.style.display = "none"; }, 3200);
  };

  function setStatus(element, message, isError) {
    element.textContent = message;
    element.dataset.state = isError ? "error" : "info";
  }

  function currentYears() {
    const override = $("experienceYears").value.trim();
    if (override === "") return profile.yearsDetected;
    const years = Number(override);
    return Number.isFinite(years) && years >= 0 && years <= 40 ? years : null;
  }

  function syncFields() {
    profile.name = $("candidateName").value.trim();
    profile.email = $("candidateEmail").value.trim();
    profile.phone = $("candidatePhone").value.trim();
    profile.preferredCity = $("preferredCity").value.trim();
    profile.yearsOverride = $("experienceYears").value.trim() === "" ? null : currentYears();
    profile.experienceYears = currentYears();
    profile.alertsEnabled = $("alertsEnabled").checked;
  }

  function persist() {
    syncFields();
    const error = window.TestoraProfileStore.save(profile);
    if (error) {
      setStatus($("profileStatus"), `Profile could not be saved on this device: ${error}`, true);
      return false;
    }
    setStatus($("profileStatus"), "Profile saved in this browser on this device.", false);
    return true;
  }

  function setContactStatus(channel, message) {
    const element = $(`${channel}Status`);
    element.textContent = message;
    element.classList.toggle("verified", channel === "email"
      ? Boolean(profile.email && profile.verifiedEmail === profile.email)
      : Boolean(profile.phone && profile.verifiedPhone === profile.phone));
  }

  function sendOtp(channel) {
    syncFields();
    const value = channel === "email" ? profile.email : profile.phone;
    const valid = channel === "email"
      ? /^\S+@\S+\.\S+$/.test(value)
      : /^\+?[\d\s().-]{7,20}$/.test(value);
    if (!valid) {
      toast(channel === "email" ? "Enter a valid email address." : "Enter a valid phone number.");
      return;
    }
    otp[channel] = "123456";
    if (channel === "email") profile.verifiedEmail = "";
    else profile.verifiedPhone = "";
    setContactStatus(channel, `Demo only: use code ${otp[channel]}. No ${channel === "email" ? "email" : "SMS"} was sent.`);
    if (channel === "email" && $("alertsEnabled").checked) {
      $("alertsEnabled").checked = false;
      profile.alertsEnabled = false;
      $("alertStatus").textContent = "Disabled until this email is verified again.";
    }
    persist();
  }

  function verifyOtp(channel) {
    syncFields();
    const value = channel === "email" ? profile.email : profile.phone;
    const code = $(`${channel}Otp`).value.trim();
    if (!otp[channel]) {
      toast("Request a demo code first.");
      return;
    }
    if (code !== otp[channel]) {
      toast("That demo code is not correct.");
      return;
    }
    if (channel === "email") profile.verifiedEmail = value;
    else profile.verifiedPhone = value;
    setContactStatus(channel, `${channel === "email" ? "Email" : "Phone"} verified for this demo.`);
    persist();
  }

  function extractSkills(text) {
    const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9+#/.\- ]/g, " ")} `;
    const aliases = { "rest-assured": "rest assured", "ci cd": "ci/cd", "cicd": "ci/cd", "test case": "test cases", "js": "javascript", "ts": "typescript", "scrum": "agile", "git hub": "git" };
    let content = normalized;
    for (const [alias, skill] of Object.entries(aliases)) content = content.split(` ${alias} `).join(` ${skill} `);
    return [...new Set(jobs.flatMap((job) => job.skills))]
      .filter((skill) => content.includes(` ${skill} `) || content.includes(` ${skill},`));
  }

  function extractYears(text) {
    const found = [...text.toLowerCase().matchAll(/(\d{1,2})(?:\.\d)?\s*\+?\s*(?:years|yrs|year)/g)]
      .map((match) => Number(match[1]))
      .filter((years) => years <= 40);
    return found.length ? Math.max(...found) : null;
  }

  async function readCv(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "txt") return file.text();
    const buffer = await file.arrayBuffer();
    if (extension === "docx") return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
    if (extension === "pdf") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let text = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        text += `${content.items.map((item) => item.str).join(" ")}\n`;
      }
      return text;
    }
    throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
  }

  function renderRecommendations() {
    const host = $("recommendations");
    host.replaceChildren();
    const years = currentYears();
    if (!profile.skills.length || years === null) {
      host.textContent = "Analyze a CV with recognized skills and experience to see exact matches.";
      return;
    }
    const matches = jobs.filter((job) =>
      job.skills.every((skill) => profile.skills.includes(skill)) &&
      job.experienceSpecified !== false &&
      years >= job.expMin && years <= job.expMax &&
      (!profile.preferredCity || window.TestoraJobSources.matchesLocation(job, profile.preferredCity))
    );
    if (!matches.length) {
      host.textContent = "No exact matches for all listed skills, experience, and location.";
      return;
    }
    matches.forEach((job) => {
      const item = document.createElement("article");
      item.className = "recommendation";
      const title = document.createElement("b");
      title.textContent = job.title;
      const meta = document.createElement("span");
      meta.className = "note";
      meta.textContent = `${job.city} · ${job.expMin}–${job.expMax} years · every listed skill matched`;
      item.append(title, meta);
      host.append(item);
    });
  }

  function renderAlertPreview() {
    const host = $("alertPreview");
    if (!profile.alertsEnabled) {
      host.textContent = "Alerts are disabled.";
      return;
    }
    const years = currentYears();
    const matches = jobs.filter((job) => {
      const overlap = years === null || (job.experienceSpecified !== false && years >= job.expMin - 1 && years <= job.expMax + 1);
      const sharedSkills = job.skills.filter((skill) => profile.skills.includes(skill)).length;
      return overlap && sharedSkills > 0 && (!profile.preferredCity || window.TestoraJobSources.matchesLocation(job, profile.preferredCity));
    });
    host.textContent = matches.length
      ? `Demo email preview for ${profile.email}: ${matches.map((job) => job.title).join(", ")}. No email was sent.`
      : "No similar jobs match these preferences. No email was sent.";
  }

  function updateAlerts() {
    const enabled = $("alertsEnabled").checked;
    if (enabled && profile.verifiedEmail !== profile.email) {
      $("alertsEnabled").checked = false;
      toast("Verify your email address before enabling alerts.");
    } else if (enabled && !profile.skills.length) {
      $("alertsEnabled").checked = false;
      toast("Analyze a CV before enabling similar-job alerts.");
    }
    profile.alertsEnabled = $("alertsEnabled").checked;
    $("alertStatus").textContent = profile.alertsEnabled
      ? "Enabled for similar matches in this demo. Email delivery is not configured."
      : "Disabled. Email delivery is not configured in this demo.";
    persist();
    renderAlertPreview();
  }

  function initializeForm() {
    $("candidateName").value = profile.name || "";
    $("candidateEmail").value = profile.email || "";
    $("candidatePhone").value = profile.phone || "";
    $("preferredCity").value = profile.preferredCity || "";
    $("experienceYears").value = profile.yearsOverride ?? "";
    $("alertsEnabled").checked = Boolean(profile.alertsEnabled);
    setContactStatus("email", profile.verifiedEmail === profile.email && profile.email ? "Email verified for this demo." : "Email not verified");
    setContactStatus("phone", profile.verifiedPhone === profile.phone && profile.phone ? "Phone verified for this demo." : "Phone not verified");
    $("skillsFound").textContent = profile.skills.length
      ? `Analyzed skills: ${profile.skills.join(", ")}`
      : "CV skills have not been analyzed.";
    $("alertStatus").textContent = profile.alertsEnabled
      ? "Enabled for similar matches in this demo. Email delivery is not configured."
      : "Disabled. Email delivery is not configured in this demo.";
    renderRecommendations();
    renderAlertPreview();
    if (stored.error) setStatus($("profileStatus"), `Profile data could not be read: ${stored.error}`, true);
  }

  function renderSavedResume(resume) {
    profile.resumeName = resume ? resume.name : "";
    $("savedResumeStatus").textContent = resume
      ? `Saved CV on this device: ${resume.name}`
      : "No CV saved on this device.";
    $("removeResume").hidden = !resume;
  }

  async function renderApplications() {
    const host = $("applicationList");
    host.replaceChildren();
    try {
      const applications = await window.TestoraDeviceStore.getApplications();
      if (!applications.length) {
        host.textContent = "No applications saved yet.";
        return;
      }
      applications.forEach((application) => {
        const item = document.createElement("article");
        item.className = "recommendation";
        const title = document.createElement("b");
        title.textContent = application.jobTitle;
        const meta = document.createElement("span");
        meta.className = "note";
        const date = new Date(application.savedAt);
        const formattedDate = Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
        meta.textContent = `${application.company} · Saved ${formattedDate} · ${application.resumeName ? `CV: ${application.resumeName}` : "No CV attached"} · Not sent to employer`;
        const remove = document.createElement("button");
        remove.className = "btn secondary small";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          try {
            await window.TestoraDeviceStore.deleteApplication(application.id);
            await renderApplications();
            await updateStorageStatus();
          } catch (error) {
            toast(error instanceof Error ? `Could not delete application: ${error.message}` : "Could not delete application.");
          }
        });
        item.append(title, meta, remove);
        host.append(item);
      });
    } catch (error) {
      host.textContent = error instanceof Error
        ? `Saved applications could not be loaded: ${error.message}`
        : "Saved applications could not be loaded.";
    }
  }

  function formatBytes(value) {
    if (!Number.isFinite(value)) return "unavailable";
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function updateStorageStatus() {
    try {
      const estimate = await window.TestoraDeviceStore.storageEstimate();
      const persisted = navigator.storage && navigator.storage.persisted
        ? await navigator.storage.persisted()
        : false;
      if (estimate.usage === null || estimate.quota === null) {
        $("storageStatus").textContent = `Data is stored in this browser on this device. Persistent storage protection ${persisted ? "is enabled" : "is not available or not enabled"}; storage usage estimate is unavailable.`;
        return;
      }
      $("storageStatus").textContent = `This site uses about ${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)} browser storage on this device. ${persisted ? "The browser has granted persistent storage." : "The browser may clear site data when device storage is low; use “Keep data on this device” to request protection."}`;
    } catch (error) {
      $("storageStatus").textContent = error instanceof Error
        ? `Could not check device storage: ${error.message}`
        : "Could not check device storage.";
    }
  }

  async function loadLocalRecords() {
    try {
      renderSavedResume(await window.TestoraDeviceStore.getResume("profile"));
    } catch (error) {
      setStatus($("cvStatus"), error instanceof Error ? `Saved CV could not be loaded: ${error.message}` : "Saved CV could not be loaded.", true);
    }
    await renderApplications();
    await updateStorageStatus();
  }

  async function refreshJobMatches() {
    const button = $("refreshRecommendations");
    button.disabled = true;
    button.textContent = "Refreshing jobs…";
    try {
      const latestJobs = await window.TestoraJobsApi.loadJobs($("catalogStatus"), {
        keyword: profile.skills[0] || "",
        location: profile.preferredCity || ""
      });
      jobs.splice(0, jobs.length, ...latestJobs);
      renderRecommendations();
      renderAlertPreview();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error.";
      setStatus($("catalogStatus"), `Could not refresh job matches: ${reason}`, true);
    } finally {
      button.disabled = false;
      button.textContent = "Refresh job matches";
    }
  }

  document.querySelectorAll("[data-send-otp]").forEach((button) => {
    button.addEventListener("click", () => sendOtp(button.dataset.sendOtp));
  });
  document.querySelectorAll("[data-verify-otp]").forEach((button) => {
    button.addEventListener("click", () => verifyOtp(button.dataset.verifyOtp));
  });
  ["candidateName", "preferredCity", "experienceYears"].forEach((id) => {
    $(id).addEventListener("input", () => {
      syncFields();
      persist();
      renderRecommendations();
      if (profile.alertsEnabled) renderAlertPreview();
    });
    $(id).addEventListener("change", () => {
      syncFields();
      persist();
      renderRecommendations();
      if (profile.alertsEnabled) renderAlertPreview();
    });
  });
  ["email", "phone"].forEach((channel) => {
    const field = $(`candidate${channel === "email" ? "Email" : "Phone"}`);
    field.addEventListener("input", () => {
      const value = field.value.trim();
      const verified = channel === "email" ? profile.verifiedEmail : profile.verifiedPhone;
      if (value !== (channel === "email" ? profile.email : profile.phone)) {
        if (channel === "email") profile.verifiedEmail = "";
        else profile.verifiedPhone = "";
        otp[channel] = "";
        if (channel === "email" && $("alertsEnabled").checked) {
          $("alertsEnabled").checked = false;
          profile.alertsEnabled = false;
          $("alertStatus").textContent = "Disabled until this email is verified again.";
        }
        setContactStatus(channel, "Contact changed. Verify this address or number again.");
      } else if (!verified) {
        setContactStatus(channel, `${channel === "email" ? "Email" : "Phone"} not verified`);
      }
      syncFields();
      persist();
    });
  });
  $("alertsEnabled").addEventListener("change", updateAlerts);
  $("refreshRecommendations").addEventListener("click", refreshJobMatches);
  $("previewAlerts").addEventListener("click", renderAlertPreview);
  $("saveProfile").addEventListener("click", () => {
    if (persist()) toast("Profile saved on this device.");
  });
  $("analyzeCv").addEventListener("click", () => {
    const text = $("cvText").value;
    if (text.trim().length < 30) {
      setStatus($("cvStatus"), "Add a CV with at least 30 characters first.", true);
      return;
    }
    (async () => {
      try {
        const resume = currentCvFile || new File([text], "pasted-cv.txt", { type: "text/plain" });
        await window.TestoraDeviceStore.saveResume(resume);
        renderSavedResume({ name: resume.name });
        profile.skills = extractSkills(text);
        profile.yearsDetected = extractYears(text);
        syncFields();
        $("skillsFound").textContent = profile.skills.length
          ? `Analyzed skills: ${profile.skills.join(", ")} · Experience found: ${profile.yearsDetected ?? "not found"}`
          : "No known skills found. Try adding skills relevant to the jobs you want.";
        setStatus($("cvStatus"), "CV analyzed and saved locally on this device. It was not uploaded to the job-feed service.", false);
        persist();
        renderRecommendations();
        renderAlertPreview();
        await updateStorageStatus();
      } catch (error) {
        setStatus($("cvStatus"), error instanceof Error ? `Could not save or analyze the CV: ${error.message}` : "Could not save or analyze the CV.", true);
      }
    })();
  });
  $("cvFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (!/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
      currentCvFile = file;
      await window.TestoraDeviceStore.saveResume(file);
      renderSavedResume({ name: file.name });
      $("cvText").value = await readCv(file);
      setStatus($("cvStatus"), "CV saved on this device and text extracted locally. Select Analyze CV to create recommendations.", false);
      await updateStorageStatus();
    } catch (error) {
      setStatus($("cvStatus"), error instanceof Error ? `Could not save or read the CV: ${error.message}` : "Could not save or read the CV.", true);
    }
  });
  $("cvText").addEventListener("input", () => { currentCvFile = null; });
  $("removeResume").addEventListener("click", async () => {
    try {
      await window.TestoraDeviceStore.deleteResume("profile");
      currentCvFile = null;
      profile.resumeName = "";
      renderSavedResume(null);
      await updateStorageStatus();
    } catch (error) {
      toast(error instanceof Error ? `Could not remove CV: ${error.message}` : "Could not remove CV.");
    }
  });
  $("keepData").addEventListener("click", async () => {
    try {
      const persisted = await window.TestoraDeviceStore.requestPersistentStorage();
      await updateStorageStatus();
      toast(persisted ? "The browser granted persistent storage for this site." : "The browser did not grant persistent storage. Export or back up important data separately.");
    } catch (error) {
      toast(error instanceof Error ? `Could not request storage protection: ${error.message}` : "Could not request storage protection.");
    }
  });
  $("clearData").addEventListener("click", async () => {
    if (!window.confirm("Delete this site's saved profile, CV, applications, and cached jobs from this device? This cannot be undone.")) return;
    try {
      await window.TestoraDeviceStore.clearAll();
      const error = window.TestoraProfileStore.clear();
      if (error) throw new Error(error);
      window.location.reload();
    } catch (error) {
      setStatus($("storageStatus"), error instanceof Error ? `Could not delete all local data: ${error.message}` : "Could not delete all local data.", true);
    }
  });

  async function start() {
    initializeForm();
    await refreshJobMatches();
    await loadLocalRecords();
  }

  start();
})();
