export const SYSMON_EVENT_LABELS: Record<number, string> = {
  1: 'Process Create',
  3: 'Network Connect',
  11: 'File Create',
};

export const SYSMON_EVENT_IDS = Object.keys(SYSMON_EVENT_LABELS).map(Number);

export const INTEGRITY_LEVELS = ['Low', 'Medium', 'High', 'System'] as const;

export const EVENT_COLORS: Record<number, { bg: string; text: string }> = {
  1:  { bg: 'bg-[#58a6ff]/20', text: 'text-[#79c0ff]' },
  3:  { bg: 'bg-[#3fb950]/20', text: 'text-[#56d364]' },
  11: { bg: 'bg-[#f0883e]/20', text: 'text-[#f0a050]' },
};

export const INTEGRITY_COLORS: Record<string, string> = {
  Low: 'text-gray-400',
  Medium: 'text-blue-300',
  High: 'text-yellow-300',
  System: 'text-red-400',
};
