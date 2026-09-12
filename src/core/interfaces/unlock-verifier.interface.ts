export interface UnlockVerificationResult {
  hasValidKey: boolean;
  expirationTimestamp?: number;
  tokenId?: string;
  accessGranted: boolean;
}

export interface IUnlockVerifierService {
  verifyKey(params: {
    viewerAddress: string;
    signature?: string;
    timestamp?: number;
  }): Promise<UnlockVerificationResult>;
}
