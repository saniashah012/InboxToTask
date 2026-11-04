// Partial automated acceptance checks, not proof of semantic correctness.
export function evaluate(result, expected, userEmail) {
  const checks = { category: result.category === expected.category,
    taskCount: expected.taskCount === undefined ? result.tasks.length >= (expected.minTasks ?? 0) : result.tasks.length === expected.taskCount,
    owners: result.tasks.every((t) => t.owner.toLowerCase() === userEmail.toLowerCase()) };
  if (expected.deadlineDates) checks.deadlines = expected.deadlineDates.every((d) => result.tasks.some((t) => t.deadline?.date === d));
  if (expected.nullDeadline) checks.noInventedDeadline = result.tasks.every((t) => t.deadline === null);
  if (expected.conditional) checks.condition = result.tasks.some((t) => t.condition !== null);
  if (expected.before) checks.beforeBoundary = result.tasks.some((t) => t.deadline?.boundary === 'before');
  if (expected.waiting) checks.waitingFor = result.waitingFor.length > 0;
  if (expected.followUp) checks.suggestedFollowUp = result.suggestedFollowUps.length > 0;
  if (expected.noFollowUp) checks.noInventedFollowUp = result.suggestedFollowUps.length === 0;
  return { checks, passed: Object.values(checks).every(Boolean), humanReview: expected.humanReview ?? 'Manually verify actions, dates/times, conditions, evidence and omissions.' };
}
