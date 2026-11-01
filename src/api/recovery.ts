// Thin fetch helpers for the admin-assisted password recovery endpoints.
// None of these ever receive or return a password hash; reset tokens are only
// read from the URL fragment by ResetPasswordPage and sent in a POST body.

export type PublicRecoveryStatus = 'pending' | 'approved' | 'completed' | 'rejected' | 'expired';

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data: any = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  return { ok: res.ok, data };
}

export async function requestRecovery(identifier: string): Promise<{ success: boolean; reference?: string; message?: string; error?: string }> {
  try {
    const { ok, data } = await post('/api/auth/recovery/request', { identifier });
    return ok ? { success: true, reference: data.reference, message: data.message } : { success: false, error: data.error || 'Request failed' };
  } catch {
    return { success: false, error: 'Network error occurred' };
  }
}

export async function getRecoveryStatus(reference: string): Promise<{ success: boolean; status?: PublicRecoveryStatus; error?: string }> {
  try {
    const res = await fetch(`/api/auth/recovery/status?reference=${encodeURIComponent(reference)}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { success: true, status: data.status } : { success: false, error: data.error || 'Could not check status' };
  } catch {
    return { success: false, error: 'Network error occurred' };
  }
}

export async function checkResetToken(token: string): Promise<{ valid: boolean; reason?: 'invalid' | 'used' | 'expired' }> {
  try {
    const { data } = await post('/api/auth/recovery/check', { token });
    return { valid: data.valid === true, reason: data.reason };
  } catch {
    return { valid: false, reason: 'invalid' };
  }
}

export async function resetWithToken(token: string, newPassword: string, confirmPassword: string): Promise<{ success: boolean; error?: string; reason?: string }> {
  try {
    const { ok, data } = await post('/api/auth/recovery/reset', { token, newPassword, confirmPassword });
    return ok ? { success: true } : { success: false, error: data.error || 'Reset failed', reason: data.reason };
  } catch {
    return { success: false, error: 'Network error occurred' };
  }
}
