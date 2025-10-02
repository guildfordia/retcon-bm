// Mock for multiformats/hashes/sha2
export const sha256 = {
  encode: jest.fn((input) => new Uint8Array(32).fill(1)),
  digest: jest.fn(async (input) => ({
    bytes: new Uint8Array(32).fill(1),
    digest: new Uint8Array(32).fill(1)
  }))
};

export const CID = {
  parse: jest.fn((str) => ({
    toString: () => str,
    bytes: new Uint8Array(32)
  })),
  create: jest.fn(() => ({
    toString: () => 'mock-cid',
    bytes: new Uint8Array(32)
  }))
};