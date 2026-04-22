function firstForwardedValue(value: string | null) {
  if (!value) {
    return null;
  }

  const first = value.split(',')[0]?.trim();
  return first || null;
}

export function resolveRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProto = firstForwardedValue(request.headers.get('x-forwarded-proto'));
  const forwardedHost = firstForwardedValue(request.headers.get('x-forwarded-host'));
  const host = forwardedHost ?? firstForwardedValue(request.headers.get('host')) ?? requestUrl.host;
  const protocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, '');

  return `${protocol}://${host}`;
}
