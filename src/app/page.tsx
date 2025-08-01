export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
          Welcome to Retcon Black Mountain
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-12 max-w-3xl mx-auto">
          A collaborative and artistic research platform exploring new ways of organizing documents, 
          memories, and social interactions through decentralized tools.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Archive Documents
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Upload and organize documents in collaborative collections with metadata and versioning.
            </p>
            <a 
              href="/documents" 
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Browse Documents
            </a>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Fork & Collaborate
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create forks of documents, track changes, and collaborate on research projects.
            </p>
            <a 
              href="/collections" 
              className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              View Collections
            </a>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Decentralized Storage
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Built on OrbitDB and IPFS for resilient, distributed document storage.
            </p>
            <a 
              href="/auth" 
              className="inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
            >
              Join Platform
            </a>
          </div>
        </div>

        <div className="mt-16 text-sm text-gray-500 dark:text-gray-400">
          <p>Status: Pre-prototype • Technology: Next.js, OrbitDB, IPFS</p>
          <p className="mt-2">
            Keywords: archive, social memory, decentralization, collective editing, experimental publishing
          </p>
        </div>
      </div>
    </div>
  );
}
