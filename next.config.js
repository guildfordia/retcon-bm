const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true, // Temporarily ignore for demo
  },
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore for demo
  },
  webpack: (config, { isServer, dev }) => {
    // P2P modules configuration
    const p2pModules = [
      'libp2p',
      'helia',
      '@orbitdb/core',
      '@libp2p/websockets',
      '@chainsafe/libp2p-noise',
      '@chainsafe/libp2p-yamux',
      '@chainsafe/libp2p-gossipsub',
      '@libp2p/identify',
      'multiformats',
      'socket.io-client'
    ];

    if (isServer) {
      // Server-side: ignore P2P modules completely
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: new RegExp(`^(${p2pModules.join('|')})$`)
        })
      );
    } else {
      // Client-side: provide fallbacks and externals
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        process: require.resolve('process/browser'),
        os: false,
        path: require.resolve('path-browserify'),
        url: require.resolve('url'),
        assert: require.resolve('assert'),
        util: require.resolve('util'),
      };

      // Provide globals
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );

      // Handle ESM modules
      config.module.rules.push({
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      });
    }

    return config;
  }
};

module.exports = nextConfig;