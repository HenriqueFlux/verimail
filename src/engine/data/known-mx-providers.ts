// Shared MX providers — domains using these are NOT catch-all by heuristic
export const SHARED_MX_PROVIDERS: readonly string[] = [
  'google.com', 'googlemail.com',            // Gmail / Google Workspace
  'outlook.com', 'hotmail.com', 'protection.outlook.com', // Microsoft 365
  'yahoo.com', 'yahoodns.net',               // Yahoo
  'protonmail.ch', 'proton.me',              // ProtonMail
  'icloud.com', 'apple.com',                 // iCloud
  'zoho.com',                                // Zoho
  'amazonses.com',                           // Amazon SES
  'sendgrid.net', 'mailgun.org',             // ESPs
  'mimecast.com',                            // Mimecast
  'pphosted.com',                            // Proofpoint
];
