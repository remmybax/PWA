// Starter files for first run. setup.js only writes these when the file is missing.

export const STANDARD_FOLDERS = [
  '01-Employment', '02-Credentials', '03-Education', '04-Resumes', '05-References', '06-Applications', '07-Leads',
];

export const DOCUMENT_FOLDERS = STANDARD_FOLDERS.slice(0, 5);

export const VAULT_TEMPLATE = `# Career Vault

<!--
How this file works:
- "## " starts a section. "### " starts an entry inside it.
- Under an entry, one fact per line as  key: value
- Add {wide} or {full} after a key to make that field wider on screen, e.g.  address {wide}: ...
- Credentials with an "expires: YYYY-MM-DD" line show up on the Today screen when they're within 90 days.
- NEVER put passwords, SSN, full driver's license number, or bank/card info here. License: last 4 digits at most.
Delete the commented examples once you've added your real entries.
-->

## Personal contact
<!--
### Contact
full_name:
phone:
email:
address {wide}:
cdl_class: A
cdl_state:
cdl_last4:
-->

## Employment
<!--
### Company Name LLC
dates: MM/YYYY – present
legal_name {wide}: Company Name LLC
address {wide}: Street, City, ST ZIP
phone:
title:
supervisor {wide}: Name, Title
start_date: MM/YYYY
end_date: Current
final_pay:
rehire_eligible:
reason_for_leaving {full}:
-->

## Credentials
<!--
### DOT medical card
expires: YYYY-MM-DD
file: 02-Credentials/DOT-Medical-Card_expYYYY-MM.pdf
-->

## Education
<!--
### School name
dates: YYYY – YYYY
program {wide}:
completed:
-->

## References
<!--
### Reference name
relationship {wide}:
phone:
email:
-->

## Stock answers
<!--
### Why are you leaving driving?
answer {full}:
-->
`;

export const SEARCHES_TEMPLATE = `# Saved searches

<!--
One "## " heading per search. sites can be any of: linkedin, indeed, glassdoor, handshake
Other targets to add when ready:
- Logistics Manager (tier 2)
- Hampton Roads (Norfolk, VA) and Skagit Valley (Mount Vernon, WA) - secondary
- Paducah, KY and Clarksville, TN - tertiary
-->

## Fleet Manager · Knoxville
keywords: fleet manager
location: Knoxville, TN
radius: 50
recency_days: 7
sites: linkedin, indeed, glassdoor, handshake

## Terminal Manager · Knoxville
keywords: terminal manager
location: Knoxville, TN
radius: 50
recency_days: 7
sites: linkedin, indeed, glassdoor, handshake

## Transportation Operations Manager · Knoxville
keywords: transportation operations manager
location: Knoxville, TN
radius: 50
recency_days: 7
sites: linkedin, indeed, glassdoor, handshake

## Operations Manager · Remote/Relocation
keywords: transportation operations manager relocation
location: United States
radius:
recency_days: 7
sites: linkedin, indeed, glassdoor, handshake
`;

export const LEADS_TEMPLATE = `# Leads

<!--
One lead per line, newest first:
- YYYY-MM-DD [claude|manual] new|applied|passed | Company | Role | City, ST | Source | https://posting-url | optional pass reason
-->
`;

export const STARTER_FILES = [
  { path: 'vault.md', text: VAULT_TEMPLATE },
  { path: 'searches.md', text: SEARCHES_TEMPLATE },
  { path: '07-Leads/leads.md', text: LEADS_TEMPLATE },
];
