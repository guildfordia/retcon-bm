// Mock for OrbitDB
const mockDatabase = {
  address: { toString: () => 'mock-db-address' },
  events: {
    on: jest.fn(),
    off: jest.fn()
  },
  add: jest.fn().mockResolvedValue('mock-hash'),
  get: jest.fn().mockResolvedValue(null),
  put: jest.fn().mockResolvedValue({}),
  del: jest.fn().mockResolvedValue({}),
  all: jest.fn().mockResolvedValue({}),
  query: jest.fn().mockResolvedValue([]),
  iterator: () => ({
    collect: jest.fn().mockResolvedValue([])
  }),
  close: jest.fn()
};

export const createOrbitDB = jest.fn().mockResolvedValue({
  open: jest.fn().mockResolvedValue(mockDatabase),
  stop: jest.fn(),
  directory: '/mock/orbitdb'
});

export const KeyValueDatabase = jest.fn();
export const EventLogDatabase = jest.fn();
export const DocumentDatabase = jest.fn();