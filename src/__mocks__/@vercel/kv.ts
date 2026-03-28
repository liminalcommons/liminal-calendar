// Mock for @vercel/kv — used in Jest to avoid ESM issues with uncrypto
export const kv = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};
