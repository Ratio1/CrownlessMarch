export const keys = {
  account: (accountId: string) => `thornwrithe:accounts:${accountId}`,
  emailVerification: (token: string) => `thornwrithe:auth:verification:${token}`,
};
