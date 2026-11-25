(() => {
  const daysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };

  window.DEMO_JOBS = [
    { id: "demo-1", title: "Senior QA Automation Engineer", company: "Sample Fintech LLC", city: "Dubai, UAE", type: "Software & QA", expMin: 5, expMax: 8, salary: "AED 18,000–25,000 / month", posted: daysAgo(1), skills: ["selenium", "java", "testng", "api testing", "rest assured", "jenkins", "ci/cd", "git"], description: "Design Selenium and Java automation frameworks, automate REST APIs, and support quality in Agile delivery." },
    { id: "demo-2", title: "Data Analyst", company: "Sample Insights Group", city: "Remote", type: "Data & Analytics", expMin: 2, expMax: 5, salary: "AED 12,000–16,000 / month", posted: daysAgo(0), skills: ["sql", "python", "excel", "power bi", "data analysis"], description: "Build reports, analyse business data, and present findings to product and operations teams." },
    { id: "demo-3", title: "Registered Nurse", company: "Sample Care Hospital", city: "Abu Dhabi, UAE", type: "Healthcare", expMin: 2, expMax: 6, salary: "AED 9,000–14,000 / month", posted: daysAgo(2), skills: ["patient care", "clinical assessment", "emergency care", "communication"], description: "Deliver patient care, monitor clinical status, and coordinate with the healthcare team." },
    { id: "demo-4", title: "Accountant", company: "Sample Trading Co.", city: "Sharjah, UAE", type: "Finance & Accounting", expMin: 3, expMax: 7, salary: "AED 8,000–12,000 / month", posted: daysAgo(5), skills: ["accounting", "bookkeeping", "excel", "financial reporting", "tax"], description: "Maintain ledgers, prepare reconciliations, and support monthly financial reporting." },
    { id: "demo-5", title: "Warehouse Supervisor", company: "Sample Logistics", city: "Riyadh, Saudi Arabia", type: "Operations", expMin: 3, expMax: 8, salary: "SAR 8,000–11,000 / month", posted: daysAgo(8), skills: ["warehouse operations", "inventory management", "team leadership", "safety"], description: "Coordinate warehouse shifts, manage inventory accuracy, and maintain safety standards." },
    { id: "demo-6", title: "Customer Support Specialist", company: "Sample Services", city: "Remote", type: "Customer Service", expMin: 0, expMax: 3, salary: "AED 5,000–8,000 / month", posted: daysAgo(10), skills: ["customer service", "communication", "crm", "problem solving"], description: "Help customers across email and chat, resolve common issues, and document product feedback." },
    { id: "demo-7", title: "Frontend Developer", company: "Sample Digital Studio", city: "Dubai, UAE", type: "Technology", expMin: 2, expMax: 5, salary: "AED 14,000–20,000 / month", posted: daysAgo(14), skills: ["javascript", "typescript", "react", "html", "css"], description: "Build accessible web features, work with designers, and improve front-end performance." },
    { id: "demo-8", title: "English Teacher", company: "Sample Learning Academy", city: "Ajman, UAE", type: "Education", expMin: 1, expMax: 4, salary: "AED 7,000–10,000 / month", posted: daysAgo(22), skills: ["teaching", "lesson planning", "classroom management", "communication"], description: "Plan lessons, assess learner progress, and create an inclusive classroom environment." }
  ];
})();
