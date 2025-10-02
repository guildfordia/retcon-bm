// Mock for libp2p
export const createLibp2p = jest.fn().mockResolvedValue({
  peerId: { toString: () => 'mock-peer-id' },
  getMultiaddrs: () => [],
  dial: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  services: {
    pubsub: {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    }
  }
});