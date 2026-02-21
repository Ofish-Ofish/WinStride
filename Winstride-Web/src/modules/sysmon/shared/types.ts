export interface ParsedProcessCreate {
  image: string;
  imageName: string;
  commandLine: string;
  user: string;
  processGuid: string;
  processId: number;
  parentProcessGuid: string;
  parentImage: string;
  parentImageName: string;
  parentCommandLine: string;
  integrityLevel: string;
  hashes: string;
  currentDirectory: string;
  logonId: string;
}

export interface ParsedNetworkConnect {
  image: string;
  imageName: string;
  sourceIp: string;
  sourcePort: number;
  destinationIp: string;
  destinationHostname: string;
  destinationPort: number;
  protocol: string;
  initiated: boolean;
  user: string;
  processGuid: string;
}

export interface ParsedFileCreate {
  image: string;
  imageName: string;
  targetFilename: string;
  targetBasename: string;
  user: string;
  processGuid: string;
  creationUtcTime: string;
}
