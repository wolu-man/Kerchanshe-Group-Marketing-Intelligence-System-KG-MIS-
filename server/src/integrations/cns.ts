import { env } from '../config/env';

export type CnsChannel = 'Email' | 'SMS' | 'WhatsApp';

export interface CnsSendRequest {
  channel: CnsChannel;
  recipient: string;
  subject?: string;
  message: string;
}

export interface CnsSendResult {
  success: boolean;
  providerMessage: string;
}

/**
 * CNS connector (FDS EPIC-05 / FR-05.2, FR-05.4).
 * When CNS_MOCK=true the connector simulates delivery (marking most attempts as
 * delivered) so the notification flow works end-to-end offline.
 */
export async function sendViaCns(request: CnsSendRequest): Promise<CnsSendResult> {
  if (env.cns.mock) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const success = request.message.length > 0;
    return {
      success,
      providerMessage: success
        ? `[mock] ${request.channel} queued to ${request.recipient}`
        : '[mock] empty message rejected',
    };
  }

  // TODO: implement REST call to env.cns.baseUrl with env.cns.apiKey once access confirmed.
  throw new Error('CNS live send not configured');
}
