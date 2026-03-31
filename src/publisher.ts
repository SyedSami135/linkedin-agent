import axios from 'axios';
import type { PublishResult } from './types.js';

const API_BASE = 'https://api.linkedin.com/v2';

function makeHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

export async function validateToken(accessToken: string): Promise<boolean> {
  try {
    await axios.get(`${API_BASE}/userinfo`, { headers: makeHeaders(accessToken) });
    return true;
  } catch {
    return false;
  }
}

export async function publishToLinkedIn(
  content: string,
  personUrn: string,
  accessToken: string
): Promise<PublishResult> {
  const payload = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  try {
    const response = await axios.post(`${API_BASE}/ugcPosts`, payload, {
      headers: makeHeaders(accessToken),
    });

    const postUrn =
      (response.headers['x-restli-id'] as string | undefined) ??
      (response.data?.id as string | undefined) ??
      'unknown';

    return { success: true, postUrn };
  } catch (err: unknown) {
    if (!axios.isAxiosError(err)) {
      return { success: false, error: String(err) };
    }

    const status = err.response?.status;

    if (status === 401) {
      const msg = 'Access token expired or invalid. Run `npm run setup` to refresh.';
      console.error(`[publisher] ${msg}`);
      return { success: false, error: msg };
    }

    if (status === 403) {
      const msg = 'Insufficient permissions. Ensure `w_member_social` scope is granted.';
      console.error(`[publisher] ${msg}`);
      return { success: false, error: msg };
    }

    if (status === 429) {
      const retryAfter = Number(err.response?.headers['retry-after'] ?? 5);
      console.warn(`[publisher] Rate limited — retrying after ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));

      try {
        const retryResponse = await axios.post(`${API_BASE}/ugcPosts`, payload, {
          headers: makeHeaders(accessToken),
        });
        const postUrn =
          (retryResponse.headers['x-restli-id'] as string | undefined) ??
          (retryResponse.data?.id as string | undefined) ??
          'unknown';
        return { success: true, postUrn };
      } catch (retryErr) {
        return { success: false, error: String(retryErr) };
      }
    }

    const errorData = JSON.stringify(err.response?.data ?? {});
    const msg = `LinkedIn API error ${status}: ${errorData}`;
    console.error(`[publisher] ${msg}`);
    return { success: false, error: msg };
  }
}
