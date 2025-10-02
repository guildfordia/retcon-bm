// Mock for Helia
export const createHelia = jest.fn().mockResolvedValue({
  fs: {
    addBytes: jest.fn().mockResolvedValue({
      cid: { toString: () => 'mock-cid-123' }
    }),
    cat: jest.fn().mockImplementation(function* () {
      yield new Uint8Array([1, 2, 3]);
    })
  },
  pins: {
    add: jest.fn().mockResolvedValue({}),
    rm: jest.fn().mockResolvedValue({})
  },
  libp2p: {
    peerId: { toString: () => 'mock-peer-id' },
    getMultiaddrs: () => [],
    dial: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  },
  stop: jest.fn()
});