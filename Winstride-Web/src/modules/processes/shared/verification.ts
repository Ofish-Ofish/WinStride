export interface VerificationBadge {
  label: string;
  className: string;
}

export function normalizeVerificationStatus(status: string | null | undefined): string {
  return status?.trim() ?? '';
}

export function isVerifiedStatus(status: string | null | undefined): boolean {
  return /^verified\b/i.test(normalizeVerificationStatus(status));
}

export function isMicrosoftVerifiedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeVerificationStatus(status);
  return /^verified\s+\(microsoft\b/i.test(normalized);
}

export function isNonVerifiedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeVerificationStatus(status);
  if (!normalized) return true;
  return !isVerifiedStatus(normalized);
}

export function getVerificationBadge(status: string | null | undefined): VerificationBadge {
  const normalized = normalizeVerificationStatus(status);

  if (!normalized) {
    return {
      label: 'Unknown',
      className: 'bg-[#6e7681]/15 text-[#9da7b3]',
    };
  }

  if (/^verified\b/i.test(normalized)) {
    return {
      label: 'Verified',
      className: 'bg-[#3fb950]/20 text-[#56d364]',
    };
  }

  if (/^unverified\b/i.test(normalized)) {
    return {
      label: 'Unverified',
      className: 'bg-[#f85149]/20 text-[#ff7b72]',
    };
  }

  if (/file not found/i.test(normalized)) {
    return {
      label: 'File Missing',
      className: 'bg-[#f0a050]/20 text-[#f0a050]',
    };
  }

  if (/access denied/i.test(normalized)) {
    return {
      label: 'Access Denied',
      className: 'bg-[#d29922]/20 text-[#e3b341]',
    };
  }

  return {
    label: 'Check Failed',
    className: 'bg-[#6e7681]/15 text-[#c9d1d9]',
  };
}
