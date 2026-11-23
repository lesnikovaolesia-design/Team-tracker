// The team and goals. Edit here to add or remove people.
export const SITE = process.env.JIRA_SITE || 'trialinteractive.atlassian.net';

export const TEAM = [
  {id: '712020:3491b821-5adb-45f7-af47-708808b31b55', name: 'Olesia Lisnykova'},
  {id: '712020:6871e6e2-dc37-4d20-8c22-65ccd79b14c7', name: 'Yana Korobka'},
  {id: '712020:c438d6a3-f3fb-4823-a07b-687259a36d90', name: 'Hanna Potapenko'},
  {id: '61ae9921b0b630006a723e7d', name: 'Liubov Kremenetska'},
  {id: '712020:d45570ca-4098-4f2b-af8c-cbabee852867', name: 'Valeriia Zarechenska'},
];

export const GOAL_PER_DAY = 8;

// How many weeks the page can show: this week plus this many earlier ones.
export const PAST_WEEKS = 7;
