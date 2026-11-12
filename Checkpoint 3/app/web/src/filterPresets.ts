export const includedTopicSuggestions = [
  "School",
  "Job applications",
  "Research",
  "Meetings",
]

export const excludedTopicSuggestions = [
  "Financial",
  "Health",
  "Promotions",
  "Family & friends",
]

// Starter word lists shown when a suggested skipped category is selected, keyed by
// lowercased category name. Must match STARTER_BLOCKED_WORDS in
// pipeline/private-topics.mjs and private.starter_blocked_words (a test compares them).
export const starterBlockedWords: Readonly<Record<string, readonly string[]>> = {
  financial: [
    "bank statement", "bank statements", "account number", "routing number", "credit card", "debit card",
    "credit score", "credit report", "loan", "loans", "mortgage", "tax return", "tax returns", "w-2", "1099",
    "paycheck", "pay stub", "pay stubs", "payroll", "wire transfer", "overdraft", "balance due",
    "billing statement", "financial aid", "venmo", "zelle", "paypal",
  ],
  health: [
    "diagnosis", "diagnoses", "diagnosed", "prescription", "prescriptions", "pharmacy", "medication",
    "medications", "therapist", "therapy", "counseling", "mental health", "medical", "medical record",
    "medical records", "lab results", "patient portal", "mychart", "symptoms", "health insurance",
    "insurance claim", "clinic", "hospital", "doctor", "doctors", "vaccine", "vaccination", "surgery",
  ],
  promotions: [
    "promo code", "promo codes", "coupon", "coupons", "discount code", "free shipping", "limited time offer",
    "flash sale", "shop now", "order now", "special offer", "exclusive offer", "deal ends",
  ],
  "family & friends": [
    "mom", "dad", "mother", "father", "grandma", "grandpa", "grandmother", "grandfather", "aunt", "uncle",
    "cousin", "sister", "brother", "family", "birthday party", "love you", "miss you",
  ],
}

// Read-only copy of STARTER_TOPIC_WORDS in pipeline/private-topics.mjs. With any
// topic to check saved, an email must contain one of these words to reach Gemini.
// A test keeps the two equal; the backend list is the one that is applied.
export const starterTopicWords: Readonly<Record<string, readonly string[]>> = {
  school: [
    "class", "classes", "course", "courses", "homework", "assignment", "assignments", "syllabus", "lecture",
    "lectures", "exam", "exams", "midterm", "midterms", "final exam", "quiz", "quizzes", "professor",
    "instructor", "teaching assistant", "office hours", "canvas", "grade", "grades", "semester", "tutoring",
    "registration", "advisor",
  ],
  "job applications": [
    "application", "applications", "applied", "interview", "interviews", "recruiter", "recruiting", "resume",
    "cover letter", "job offer", "offer letter", "internship", "internships", "position", "hiring", "candidate",
    "background check", "career fair", "job",
  ],
  research: [
    "research", "study", "paper", "papers", "manuscript", "journal", "conference", "submission", "reviewer",
    "irb", "dataset", "experiment", "experiments", "survey", "literature review", "lab meeting", "thesis",
    "dissertation", "grant", "abstract",
  ],
  meetings: [
    "meeting", "meetings", "meet", "zoom", "google meet", "teams meeting", "calendar invite", "invitation",
    "agenda", "minutes", "schedule", "reschedule", "rescheduled", "availability", "appointment", "call",
  ],
}
