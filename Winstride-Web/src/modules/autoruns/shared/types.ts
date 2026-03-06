export interface AutorunEntry {
  id: number;
  time: string;
  entryLocation: string;
  entry: string;
  enabled: string;
  category: string;
  profile: string;
  description: string;
  company: string;
  imagePath: string | null;
  version: string;
  launchString: string;
  md5: string | null;
  sha1: string | null;
  peSha1: string | null;
  peSha256: string | null;
  sha256: string | null;
  imp: string | null;
  verified: string | null;
  batchId: string;
  machineName: string;
  timeSynced: string;
}
