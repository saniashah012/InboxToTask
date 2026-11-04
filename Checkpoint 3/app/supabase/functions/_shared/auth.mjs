// Verify with Auth, not by trusting a decoded JWT or public application key.
export function createUserVerifier({ url, publicKey, fetchImpl = fetch }) {
  return async (token) => {
    if (!url || !publicKey) throw new Error('AUTH_UNAVAILABLE');
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if ([401, 403].includes(response.status)) return null;
    if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
    const user = await response.json();
    if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)
      || typeof user.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
      || user.is_anonymous === true) return null;
    return { id: user.id, email: user.email };
  };
}
