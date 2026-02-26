const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isLocalhost(url: URL): boolean {
  return LOCALHOST_HOSTS.has(url.hostname);
}

export function resolveAuthRedirectUrl(currentOrigin: string): string | null {
  const configuredPublicUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  const configuredPath = import.meta.env.VITE_AUTH_REDIRECT_PATH?.trim() || '/';

  if (configuredPublicUrl) {
    const baseUrl = parseUrl(configuredPublicUrl);
    if (!baseUrl) {
      console.warn('VITE_PUBLIC_APP_URL no es una URL válida.');
      return null;
    }

    return new URL(configuredPath, `${baseUrl.origin}/`).toString();
  }

  const runtimeUrl = parseUrl(currentOrigin);
  if (!runtimeUrl) {
    return null;
  }

  if (isLocalhost(runtimeUrl)) {
    return null;
  }

  return new URL(configuredPath, `${runtimeUrl.origin}/`).toString();
}

