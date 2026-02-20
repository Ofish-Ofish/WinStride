/* ------------------------------------------------------------------ */
/*  System account detection                                           */
/* ------------------------------------------------------------------ */

const SYSTEM_ACCOUNTS = new Set([
  'SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE', 'ANONYMOUS LOGON',
  'DefaultAccount', 'WDAGUtilityAccount', 'Guest', '-',
  'DefaultAppPool', 'IUSR', 'sshd', 'krbtgt',
]);

const SYSTEM_ACCOUNT_PATTERNS = [
  /\$$/,              // machine accounts: DESKTOP-01$, SERVER$
  /^DWM-\d+$/,        // Desktop Window Manager: DWM-1, DWM-2, DWM-3
  /^UMFD-\d+$/,       // User Mode Font Driver: UMFD-0, UMFD-1
  /^IUSR/,            // IIS anonymous user
  /^DefaultAppPool/i, // IIS default app pool
  /^\.NET/i,          // .NET runtime accounts (.NETClassic, etc.)
  /^ASPNET/i,         // ASP.NET service accounts
  /^IIS[ _]?APPPOOL/i,// IIS application pool identities
  /^MSSQL/i,          // SQL Server service accounts
  /^SQLServer/i,      // SQL Server accounts
  /^NT SERVICE\\/i,   // NT SERVICE\* accounts
  /^NT AUTHORITY/i,   // NT AUTHORITY accounts
  /^healthmailbox/i,  // Exchange health mailbox
];

export function isSystemAccount(name: string): boolean {
  if (SYSTEM_ACCOUNTS.has(name)) return true;
  return SYSTEM_ACCOUNT_PATTERNS.some((p) => p.test(name));
}

/* ------------------------------------------------------------------ */
/*  Event labels & categories                                          */
/* ------------------------------------------------------------------ */

export const EVENT_LABELS: Record<number, string> = {
  4624: 'Logon',
  4625: 'Failed Logon',
  4634: 'Logoff',
  4647: 'User Logoff',
  4648: 'Run As Other User',
  4662: 'Object Access',
  4672: 'Admin Logon',
  4720: 'Account Created',
  4722: 'Account Enabled',
  4723: 'Password Change',
  4724: 'Password Reset',
  4725: 'Account Disabled',
  4726: 'Account Deleted',
  4728: 'Added to Group',
  4732: 'Added to Local Group',
  4733: 'Removed from Group',
  4738: 'Account Changed',
  4740: 'Account Locked Out',
  4756: 'Added to Universal Group',
  4767: 'Account Unlocked',
  4768: 'Kerberos TGT',
  4769: 'Kerberos Service Ticket',
  4776: 'NTLM Auth',
  4798: 'Group Lookup',
  4799: 'Local Group Lookup',
  5379: 'Credential Read',
};

// NTSTATUS codes for 4625 failed logon events
export const FAILURE_STATUS_LABELS: Record<string, string> = {
  '0xc0000064': 'User does not exist',
  '0xc000006a': 'Wrong password',
  '0xc0000234': 'Account locked out',
  '0xc0000072': 'Account disabled',
  '0xc000006f': 'Outside allowed hours',
  '0xc0000070': 'Unauthorized workstation',
  '0xc0000071': 'Password expired',
  '0xc0000193': 'Account expired',
  '0xc0000224': 'Password must change',
  '0xc0000225': 'Windows bug (not a risk)',
  '0xc000015b': 'Logon type not granted',
  '0xc000006d': 'Bad username or auth info',
  '0xc000006e': 'Account restriction',
  '0xc0000133': 'Clock out of sync with DC',
  '0xc0000413': 'Auth firewall / policy denied',
};

export const LOGON_TYPE_LABELS: Record<number, string> = {
  2: 'Interactive',
  3: 'Network',
  4: 'Batch',
  5: 'Service',
  7: 'Unlock',
  8: 'NetCleartext',
  9: 'NewCreds',
  10: 'RDP',
  11: 'Cached',
};

export const EVENT_CATEGORIES: { name: string; ids: number[] }[] = [
  { name: 'Authentication', ids: [4624, 4625, 4634, 4647, 4648] },
  { name: 'Privileges', ids: [4672] },
  { name: 'Account Mgmt', ids: [4720, 4722, 4723, 4724, 4725, 4726, 4738, 4740, 4767] },
  { name: 'Group Changes', ids: [4728, 4732, 4733, 4756] },
  { name: 'Kerberos & NTLM', ids: [4768, 4769, 4776] },
  { name: 'Object Access', ids: [4662, 4798, 4799, 5379] },
];

export const ALL_EVENT_IDS = Object.keys(EVENT_LABELS).map(Number);
export const ALL_LOGON_TYPES = Object.keys(LOGON_TYPE_LABELS).map(Number);
